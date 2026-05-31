/**
 * Weekly price refresh. Re-fetches card JSON (which embeds TCGPlayer + Cardmarket
 * prices) from pokemontcg.io and overwrites raw_data on cards already in
 * cards_vectors. Does NOT recompute embeddings — embeddings depend on card text,
 * not price.
 *
 * Pages at 250 (TCG API max) so a full ~14K refresh is ~56 requests.
 * Self-invokes for the next page to stay under Edge Function timeout.
 *
 * POST { page?: number }
 */
import { corsResponse, json, err } from '../_shared/cors.ts';
import { makeClient, tcgFetch } from '../_shared/supabase.ts';

const PAGE_SIZE = 250;

interface TCGCardPrice {
  id: string;
  tcgplayer?: unknown;
  cardmarket?: unknown;
  [k: string]: unknown;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();
  if (req.method !== 'POST') return err('POST only', 405);

  try {
    const body = await req.json().catch(() => ({}));
    const page: number = body.page ?? 1;

    const supabase = makeClient();
    const now = new Date().toISOString();

    const data = await tcgFetch(
      `https://api.pokemontcg.io/v2/cards?page=${page}&pageSize=${PAGE_SIZE}&orderBy=id`
    ) as { data: TCGCardPrice[]; totalCount: number; count: number; pageSize: number };

    const cards: TCGCardPrice[] = data.data ?? [];
    if (cards.length === 0) {
      return json({ done: true, page, updated: 0 });
    }

    // Only update cards that already exist in cards_vectors. We don't want
    // refresh-prices to insert new cards — that's ingest-cards' job (it also
    // computes embeddings).
    const ids = cards.map((c) => c.id);
    const { data: existing, error: selErr } = await supabase
      .from('cards_vectors')
      .select('card_id')
      .in('card_id', ids);

    if (selErr) return err(selErr.message);
    const existingIds = new Set((existing ?? []).map((r) => r.card_id as string));

    const updates = cards
      .filter((c) => existingIds.has(c.id))
      .map((card) => ({
        card_id: card.id,
        raw_data: card as unknown as Record<string, unknown>,
        prices_updated_at: now,
      }));

    let updatedCount = 0;
    if (updates.length > 0) {
      // Upsert with onConflict on card_id — only writes raw_data + prices_updated_at.
      // Other columns (name, embedding, etc.) stay untouched because we don't include them.
      // NOTE: Supabase upsert replaces the row, so to be safe we use individual updates
      // for the subset of columns. Run them in parallel.
      const results = await Promise.all(
        updates.map((u) =>
          supabase
            .from('cards_vectors')
            .update({ raw_data: u.raw_data, prices_updated_at: u.prices_updated_at })
            .eq('card_id', u.card_id)
        )
      );
      const failed = results.filter((r) => r.error);
      if (failed.length > 0) {
        return err(`Update errors: ${failed.map((r) => r.error?.message).join('; ')}`);
      }
      updatedCount = updates.length;
    }

    const hasMore = page * PAGE_SIZE < (data.totalCount ?? 0);
    if (hasMore) {
      const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/refresh-prices`;
      fetch(selfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ page: page + 1 }),
      }).catch(() => {});
    }

    return json({
      page,
      fetched: cards.length,
      updated: updatedCount,
      total: data.totalCount,
      hasMore,
    });
  } catch (e) {
    console.error('refresh-prices error:', e);
    return err(e instanceof Error ? e.message : 'Internal error');
  }
});
