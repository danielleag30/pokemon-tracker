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
const RETRY_BACKOFF_MS = [1000, 3000, 6000, 12000];
const MAX_PAGE_GUARD = 500; // ~125k cards; a runaway-chain backstop

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry wrapper — pokemontcg.io has been measured at 20-50% 5xx. Without
 *  this a single bad page killed the entire ~82-page chain, which is why
 *  prices_updated_at was NULL on every row despite the cron firing on
 *  schedule since May (confirmed in the 2026-08-14 Actions run: the job
 *  reached the function fine and died on `{"error":"TCG 500"}`). */
async function tcgFetchRetry(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    try {
      return await tcgFetch(url);
    } catch (e) {
      lastError = e;
      if (attempt < RETRY_BACKOFF_MS.length) {
        const base = RETRY_BACKOFF_MS[attempt];
        await sleep(base + Math.floor(Math.random() * base * 0.3));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unknown fetch error');
}

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

    function chainNext(nextPage: number) {
      if (nextPage > MAX_PAGE_GUARD) return;
      const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/refresh-prices`;
      fetch(selfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ page: nextPage }),
      }).catch(() => {});
    }

    let data: { data: TCGCardPrice[]; totalCount: number; count: number; pageSize: number };
    try {
      data = await tcgFetchRetry(
        `https://api.pokemontcg.io/v2/cards?page=${page}&pageSize=${PAGE_SIZE}&orderBy=id`
      ) as typeof data;
    } catch (e) {
      // Skip this page rather than killing the chain. Prices are advisory and
      // the next scheduled run re-covers the same pages, so one unreachable
      // page costs a few stale cards — whereas aborting costs every page
      // after it, which is exactly how this silently never completed.
      const message = e instanceof Error ? e.message : 'Unknown fetch error';
      console.error(`refresh-prices page ${page} unrecoverable, skipping: ${message}`);
      chainNext(page + 1);
      return json({ page, skipped: true, error: message });
    }

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
      // One server-side statement instead of 250 parallel single-row updates.
      // The RPC also enforces the two rules this function used to violate:
      // never replace an existing cardmarket object with an upstream payload
      // that has none (pokemontcg.io returns me3/me2pt5 with no pricing at
      // all, which would have wiped the 419-card TCGdex backfill), and never
      // touch a row whose data_source isn't 'pokemontcg'.
      const { data: affected, error: rpcErr } = await supabase.rpc('refresh_card_prices', {
        p_updates: updates.map((u) => ({ card_id: u.card_id, raw_data: u.raw_data })),
      });
      if (rpcErr) {
        // Report but keep the chain alive — one bad page must not strand
        // every page after it.
        console.error(`refresh-prices page ${page} update failed: ${rpcErr.message}`);
      } else {
        updatedCount = typeof affected === 'number' ? affected : updates.length;
      }
    }

    const hasMore = page * PAGE_SIZE < (data.totalCount ?? 0);
    if (hasMore) chainNext(page + 1);

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
