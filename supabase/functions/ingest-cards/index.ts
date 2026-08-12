/**
 * Fan-out card ingestion, one Pokémon TCG set per invocation. Claims a
 * pending/error/stale-processing row from ingest_queue
 * (claim_next_ingest_set(), atomic via FOR UPDATE SKIP LOCKED, attempts
 * incremented at claim time so a hard isolate kill still counts against
 * the 5-attempt cap), pages that set's cards at PAGE_SIZE=250 (API max,
 * not the old scheme's 10), embeds and upserts into cards_vectors, then
 * self-invokes to claim the next set.
 *
 * Every failure path after a successful claim — fetch, a short/truncated
 * page count, embedding, or the upsert — goes through one handler that
 * marks the row 'error' with last_error populated and keeps the chain
 * moving. No path may return with the row left in 'processing': that's
 * exactly what let the original ingest die silently at page 1,401/2,046 in
 * May (found in review before this ever ran: embedBatch() throwing had no
 * catch of its own, which would have wedged the row in 'processing'
 * forever — unclaimable, since claim_next_ingest_set() only picked up
 * 'pending'/'error', and ingest-check's self-heal gate would see that one
 * stuck row and refuse to ever nudge the chain again).
 *
 * POST {} — no body needed; claims whatever's next in the queue.
 */
import { corsResponse, json, err } from '../_shared/cors.ts';
import { makeClient, tcgFetch } from '../_shared/supabase.ts';

const PAGE_SIZE = 250;
const RETRY_BACKOFF_MS = [1000, 4000, 16000];

interface TCGCard {
  id: string;
  name: string;
  set: { id: string; name: string };
  types?: string[];
  supertype?: string;
  subtypes?: string[];
  rarity?: string;
  hp?: string;
  evolvesFrom?: string;
  nationalPokedexNumbers?: number[];
  images: { small: string; large: string };
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  // @ts-ignore
  const session = new Supabase.ai.Session('gte-small');
  const results: number[][] = [];
  for (const text of texts) {
    const r = await session.run(text, { mean_pool: true, normalize: true });
    // session.run returns a Float32Array directly, not { data: ... }
    results.push(Array.from(r as ArrayLike<number>));
  }
  return results;
}

function cardToText(card: TCGCard): string {
  const parts = [
    card.name,
    card.supertype,
    card.subtypes?.join(' '),
    card.types?.join(' '),
    card.set.name,
    card.rarity,
    card.hp ? `HP ${card.hp}` : null,
    card.evolvesFrom ? `evolves from ${card.evolvesFrom}` : null,
  ].filter(Boolean);
  return parts.join(' ');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSetCardsOnce(setId: string): Promise<TCGCard[]> {
  let page = 1;
  let allCards: TCGCard[] = [];
  let hasMore = true;
  while (hasMore) {
    const data = await tcgFetch(
      // orderBy=id (not number) — number is a non-unique string upstream,
      // not a total order, so a tie spanning a page boundary can drop cards.
      `https://api.pokemontcg.io/v2/cards?q=set.id:${encodeURIComponent(setId)}&page=${page}&pageSize=${PAGE_SIZE}&orderBy=id`
    ) as { data: TCGCard[] };
    allCards = [...allCards, ...data.data];
    hasMore = data.data.length === PAGE_SIZE;
    page++;
  }
  return allCards;
}

async function fetchSetCardsWithRetry(setId: string): Promise<TCGCard[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    try {
      return await fetchSetCardsOnce(setId);
    } catch (e) {
      lastError = e;
      if (attempt < RETRY_BACKOFF_MS.length) await sleep(RETRY_BACKOFF_MS[attempt]);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Unknown fetch error');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();
  if (req.method !== 'POST') return err('POST only', 405);

  const supabase = makeClient();

  function selfInvokeNext() {
    const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ingest-cards`;
    fetch(selfUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: '{}',
    }).catch(() => {});
  }

  try {
    const { data: claimedRows, error: claimErr } = await supabase.rpc('claim_next_ingest_set');
    if (claimErr) return err(claimErr.message);

    const claimed = claimedRows?.[0] as { id: string; set_id: string; upstream_total: number | null; attempts: number } | undefined;
    if (!claimed) return json({ done: true, message: 'No pending sets in ingest_queue' });

    const { id: queueId, set_id: setId, upstream_total: upstreamTotal } = claimed;

    // Everything from here on operates on an already-claimed row. Any throw
    // in this block — fetch, a short page count, embedding, or the upsert —
    // must mark the row 'error' and keep the chain moving. This is the one
    // handler for all of it; nothing after a successful claim may exit
    // without going through here.
    try {
      const cards = await fetchSetCardsWithRetry(setId);

      if (cards.length === 0) {
        throw new Error('Upstream returned 0 cards for this set');
      }
      // A 200 with a short/empty page mid-pagination (rather than a thrown
      // error) would otherwise look "complete" — cross-check against the
      // total this row was seeded with (same pattern as cards/index.ts's
      // Phase 0 fix for the identical class of bug).
      if (upstreamTotal != null && cards.length < upstreamTotal) {
        throw new Error(`Incomplete fetch: got ${cards.length} of ${upstreamTotal} cards`);
      }

      const texts = cards.map(cardToText);
      const embeddings = await embedBatch(texts);

      const rows = cards.map((card, i) => ({
        card_id: card.id,
        name: card.name,
        set_name: card.set.name,
        set_id: card.set.id,
        types: card.types ?? [],
        supertype: card.supertype ?? null,
        subtypes: card.subtypes ?? [],
        rarity: card.rarity ?? null,
        hp: card.hp ?? null,
        evolves_from: card.evolvesFrom ?? null,
        national_pokedex_numbers: card.nationalPokedexNumbers ?? [],
        image_small: card.images.small,
        image_large: card.images.large,
        raw_data: card as unknown as Record<string, unknown>,
        embedding: `[${embeddings[i].join(',')}]`,
        indexed_at: new Date().toISOString(),
      }));

      const { error: upsertErr } = await supabase
        .from('cards_vectors')
        .upsert(rows, { onConflict: 'card_id' });
      if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`);

      const { error: doneErr } = await supabase.from('ingest_queue').update({
        status: 'done',
        ingested_count: rows.length,
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq('id', queueId);
      if (doneErr) console.error(`Failed to mark ${queueId} done (data is ingested; row state will self-correct via lease reclaim):`, doneErr.message);

      selfInvokeNext();
      return json({ setId, ingested: rows.length, upstreamTotal });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      const { error: failErr } = await supabase.from('ingest_queue').update({
        status: 'error',
        last_error: message,
        updated_at: new Date().toISOString(),
      }).eq('id', queueId);
      if (failErr) console.error(`Failed to mark ${queueId} error (will recover via 10-minute lease reclaim):`, failErr.message);

      selfInvokeNext(); // keep the chain moving to the next set regardless of this failure
      return err(`Failed to ingest ${setId}: ${message}`);
    }
  } catch (e) {
    // Only reachable if claim_next_ingest_set() itself failed (network/DB
    // error before any row was claimed) — nothing to mark, nothing to
    // self-invoke into since we don't know what, if anything, is claimable.
    console.error('Ingest error (pre-claim):', e);
    return err(e instanceof Error ? e.message : 'Internal error');
  }
});
