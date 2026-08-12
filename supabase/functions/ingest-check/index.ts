/**
 * Ingest coverage check. Compares live upstream sets against cards_vectors
 * per set_id and reports any gap — this is the detector for the exact
 * failure this build plan exists to fix: a stalled ingest chain that stops
 * processing while every ingest_queue row still reads 'done'.
 *
 * GET  -> report only: { checked, gaps: [{set_id, name, ingested_count, upstream_total, gap}], reconciled }
 * POST -> same report, plus self-healing: any set with a genuine shortfall
 *         (upstream_total > ingested_count — ignores the reverse, which is
 *         a known upstream data quirk on a few sets, not a bug here) gets
 *         its ingest_queue row upserted to 'pending' if it isn't already
 *         mid-flight, then the ingest-cards chain is nudged once if nothing
 *         is currently 'processing'. Called weekly by GitHub Actions cron.
 */
import { corsResponse, json, err } from '../_shared/cors.ts';
import { makeClient, tcgFetch } from '../_shared/supabase.ts';

interface Gap {
  set_id: string;
  name: string;
  ingested_count: number;
  upstream_total: number;
  gap: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();
  if (req.method !== 'GET' && req.method !== 'POST') return err('GET or POST only', 405);

  try {
    const supabase = makeClient();

    const setsData = await tcgFetch(
      'https://api.pokemontcg.io/v2/sets?orderBy=-releaseDate&pageSize=250'
    ) as { data: Array<{ id: string; name: string; total: number }> };
    const sets = setsData.data ?? [];

    // Aggregated server-side via ingest_coverage_by_set() — a plain
    // .select('set_id') here is silently capped at 1,000 rows by PostgREST's
    // default limit (confirmed live: content-range 0-999/13700), which
    // wildly undercounted every set once the catalog passed 1,000 rows.
    const { data: indexed, error: indexedErr } = await supabase.rpc('ingest_coverage_by_set');
    if (indexedErr) return err(indexedErr.message);

    const indexedCounts = new Map<string, number>();
    for (const row of (indexed ?? []) as { set_id: string; ingested_count: number }[]) {
      indexedCounts.set(row.set_id, row.ingested_count);
    }

    const gaps: Gap[] = sets
      .map((s) => {
        const ingested_count = indexedCounts.get(s.id) ?? 0;
        return { set_id: s.id, name: s.name, ingested_count, upstream_total: s.total, gap: s.total - ingested_count };
      })
      .filter((r) => r.gap !== 0)
      .sort((a, b) => b.gap - a.gap);

    const reconciled = gaps.length === 0;

    if (req.method === 'GET') {
      return json({ checked: sets.length, gaps, reconciled });
    }

    // POST: self-heal genuine shortfalls (gap > 0). A negative gap means
    // cards_vectors has MORE rows than the upstream set's declared total —
    // seen on a handful of sets (sve, svp, sm10, sm11, smp) and is an
    // upstream data quirk, not something re-ingesting would fix.
    const shortfalls = gaps.filter((g) => g.gap > 0);
    let queued = 0;
    let triggered = false;

    if (shortfalls.length > 0) {
      const { data: activeRows } = await supabase
        .from('ingest_queue').select('id').eq('status', 'processing');
      const active = new Set((activeRows ?? []).map((r) => r.id as string));

      const upserts = shortfalls
        .filter((g) => !active.has(g.set_id))
        .map((g) => ({ id: g.set_id, set_id: g.set_id, upstream_total: g.upstream_total, status: 'pending' }));

      if (upserts.length > 0) {
        const { error: upsertErr } = await supabase
          .from('ingest_queue').upsert(upserts, { onConflict: 'id' });
        if (upsertErr) return err(upsertErr.message);
        queued = upserts.length;
      }

      if (active.size === 0 && queued > 0) {
        const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ingest-cards`;
        fetch(selfUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: '{}',
        }).catch(() => {});
        triggered = true;
      }
    }

    return json({ checked: sets.length, gaps, reconciled, queued, triggered });
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Internal error');
  }
});
