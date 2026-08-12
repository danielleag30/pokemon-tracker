/**
 * Fan-out card ingestion, one Pokémon TCG set per invocation. Claims a
 * pending/error row from ingest_queue (claim_next_ingest_set(), atomic via
 * FOR UPDATE SKIP LOCKED), pages that set's cards at PAGE_SIZE=250 (API
 * max, not the old scheme's 10), embeds and upserts into cards_vectors,
 * then self-invokes to claim the next set.
 *
 * On upstream fetch failure, retries with exponential backoff before
 * marking the row status='error' with last_error populated and attempts
 * incremented — never silently marks a failed set 'done'. That silent
 * failure is exactly what let the old ingest die at page 1,401/2,046 with
 * every row still reading 'done'. A stalled or dead self-invoke chain is
 * now detectable via ingest-check's coverage report (compares
 * cards_vectors against each set's upstream_total) rather than trusted
 * implicitly.
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
      `https://api.pokemontcg.io/v2/cards?q=set.id:${encodeURIComponent(setId)}&page=${page}&pageSize=${PAGE_SIZE}&orderBy=number`
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

  async function markFailed(queueId: string, attempts: number, message: string) {
    await supabase.from('ingest_queue').update({
      status: 'error',
      last_error: message,
      attempts: attempts + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', queueId);
  }

  try {
    const { data: claimedRows, error: claimErr } = await supabase.rpc('claim_next_ingest_set');
    if (claimErr) return err(claimErr.message);

    const claimed = claimedRows?.[0] as { id: string; set_id: string; upstream_total: number | null; attempts: number } | undefined;
    if (!claimed) return json({ done: true, message: 'No pending sets in ingest_queue' });

    const { id: queueId, set_id: setId, attempts } = claimed;

    let cards: TCGCard[];
    try {
      cards = await fetchSetCardsWithRetry(setId);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown fetch error';
      await markFailed(queueId, attempts, `Fetch failed: ${message}`);
      selfInvokeNext(); // keep the chain moving to the next set regardless of this failure
      return err(`Failed to fetch ${setId} after ${RETRY_BACKOFF_MS.length + 1} attempts: ${message}`);
    }

    if (cards.length === 0) {
      await markFailed(queueId, attempts, 'Upstream returned 0 cards for this set');
      selfInvokeNext();
      return err(`No cards returned for ${setId}`);
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

    if (upsertErr) {
      await markFailed(queueId, attempts, `Upsert failed: ${upsertErr.message}`);
      selfInvokeNext();
      return err(upsertErr.message);
    }

    await supabase.from('ingest_queue').update({
      status: 'done',
      ingested_count: rows.length,
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', queueId);

    selfInvokeNext();

    return json({ setId, ingested: rows.length, upstreamTotal: claimed.upstream_total });
  } catch (e) {
    console.error('Ingest error:', e);
    return err(e instanceof Error ? e.message : 'Internal error');
  }
});
