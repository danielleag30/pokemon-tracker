/**
 * Weekly incremental ingest check.
 * Compares current TCG API sets against already-indexed cards
 * and triggers ingest-cards only for sets with new/missing cards.
 *
 * POST {} — called by GitHub Actions weekly cron
 */
import { corsResponse, json, err } from '../_shared/cors.ts';
import { makeClient, tcgFetch } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();
  if (req.method !== 'POST') return err('POST only', 405);

  try {
    const supabase = makeClient();

    // Get all sets from TCG API
    const setsData = await tcgFetch(
      'https://api.pokemontcg.io/v2/sets?orderBy=-releaseDate&pageSize=250'
    ) as { data: Array<{ id: string; total: number; name: string }> };

    const sets = setsData.data ?? [];

    // Get indexed card counts per set
    const { data: indexed } = await supabase
      .from('cards_vectors')
      .select('set_id')
      .not('set_id', 'is', null);

    const indexedCounts = new Map<string, number>();
    for (const row of (indexed ?? []) as { set_id: string }[]) {
      indexedCounts.set(row.set_id, (indexedCounts.get(row.set_id) ?? 0) + 1);
    }

    // Find sets that are missing or incomplete
    const setsToUpdate = sets.filter(s => {
      const have = indexedCounts.get(s.id) ?? 0;
      return have < s.total;
    });

    if (setsToUpdate.length === 0) {
      return json({ message: 'All sets up to date', checked: sets.length });
    }

    // Trigger a full re-ingest starting from page 1
    // (ingest-cards is idempotent per page, so duplicates are safe)
    const selfBase = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ingest-cards`;
    const authHeader = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

    fetch(selfBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify({ page: 1, forceRefresh: false }),
    }).catch(() => {});

    return json({
      message: `Triggered ingest for ${setsToUpdate.length} incomplete sets`,
      setsToUpdate: setsToUpdate.map(s => s.id),
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Internal error');
  }
});
