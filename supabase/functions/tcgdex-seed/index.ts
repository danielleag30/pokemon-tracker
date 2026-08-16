/**
 * One-shot seeder for sets that exist in TCGdex but not in pokemontcg.io.
 *
 * Rather than teaching the ingest chain a second fetch path, this normalizes
 * the whole set once and writes it into `set_cards_cache` in the app's own
 * TCGCard shape. Two things then follow for free:
 *   - `GET /cards/set/:id` serves it from cache, so the set is browsable with
 *     no change to the cards function
 *   - ingest-cards' existing cache-first path chunks it into cards_vectors
 *     with all the usual durability (atomic claim, lease reclaim, coverage
 *     check), so RAG and owned-card resolution pick it up
 *
 * Card fetches are sequential I/O, which doesn't count against the 2s CPU
 * cap — only wall clock (150s on free), and 60 cards lands well inside that.
 *
 * POST { setId: "mep" }
 */
import { corsResponse, json, err } from '../_shared/cors.ts';
import { makeClient } from '../_shared/supabase.ts';
import { fetchNormalizedTcgdexSet, TCGDEX_ONLY_SET_IDS } from '../_shared/tcgdex.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();
  if (req.method !== 'POST') return err('POST only', 405);

  try {
    const { setId } = await req.json().catch(() => ({})) as { setId?: string };
    if (!setId) return err('setId is required', 400);

    // Allowlist rather than arbitrary passthrough: this writes directly into
    // the catalog cache, so it shouldn't be a general "import any set" lever.
    if (!TCGDEX_ONLY_SET_IDS.includes(setId)) {
      return err(`${setId} is not in TCGDEX_ONLY_SET_IDS; refusing to seed`, 400);
    }

    const supabase = makeClient();
    const { set, cards } = await fetchNormalizedTcgdexSet(setId);

    if (cards.length === 0) return err(`TCGdex returned no usable cards for ${setId}`);

    const expected = set.cardCount?.total ?? cards.length;
    const result = { data: cards, count: cards.length };

    const { error: cacheErr } = await supabase.from('set_cards_cache').upsert({
      set_id: setId,
      data: result,
      card_count: cards.length,
      cached_at: new Date().toISOString(),
    }, { onConflict: 'set_id' });
    if (cacheErr) return err(`set_cards_cache upsert failed: ${cacheErr.message}`);

    // upstream_total is the count we actually retrieved, not the set's
    // nominal total — MEP advertises 60 but numbers sparsely up to mep-080,
    // and the ingest completion check compares against this value.
    const { error: queueErr } = await supabase.from('ingest_queue').upsert({
      id: setId,
      set_id: setId,
      upstream_total: cards.length,
      ingested_count: 0,
      status: 'pending',
      attempts: 0,
      last_error: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (queueErr) return err(`ingest_queue upsert failed: ${queueErr.message}`);

    return json({
      setId,
      setName: set.name,
      cardsNormalized: cards.length,
      nominalTotal: expected,
      queued: true,
      sample: cards.slice(0, 2).map((c) => ({ id: c.id, name: c.name })),
    });
  } catch (e) {
    console.error('tcgdex-seed error:', e);
    return err(e instanceof Error ? e.message : 'Internal error');
  }
});
