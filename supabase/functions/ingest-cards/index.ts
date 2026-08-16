/**
 * Chunked card ingestion. Each invocation processes CHUNK_SIZE (10) cards —
 * fetch, embed, upsert — then self-invokes to continue.
 *
 * WHY 10 AND NOT A WHOLE SET: Supabase Edge Functions cap every request at
 * 2s of actual CPU time (identical on free and paid plans — only wall clock
 * differs, 150s vs 400s, which is not the binding limit here). Embedding is
 * synchronous CPU work, so a whole-set invocation (up to 304 cards) blows
 * that ceiling and returns 546 WORKER_RESOURCE_LIMIT before finishing. The
 * original May 2026 ingest used 10-per-invocation and successfully embedded
 * 13,700 cards on this same free-tier project; a later rewrite to
 * whole-set-per-invocation is what broke it. This restores the batch size
 * that provably works while keeping the durability the rewrite added
 * (atomic claim, lease reclaim, attempts cap, coverage assertion).
 *
 * RESUMPTION: progress within a set is ingest_queue.ingested_count, so the
 * page to fetch is derived, not remembered — floor(ingested_count/10)+1
 * against a stable orderBy=id sort. A chain that dies mid-set leaves the row
 * 'processing'; the 10-minute lease reclaim in claim_next_ingest_set() picks
 * it back up and resumes from ingested_count rather than restarting the set.
 * Upserts are idempotent on card_id, so a replayed chunk is harmless.
 *
 * POST {}                    -> claim the next set, start at its next chunk
 * POST { resumeSetId: "x" }  -> continue a set this chain already claimed
 */
import { corsResponse, json, err } from '../_shared/cors.ts';
import { makeClient, tcgFetch } from '../_shared/supabase.ts';
import { TCGDEX_ONLY_SET_IDS } from '../_shared/tcgdex.ts';

// 3. Supabase meters CPU **per worker isolate, not per request**, and the
// isolate is reused across the self-invoke chain — so embedding cost
// accumulates until the worker trips. A worker retires gracefully once it
// passes 50% of the 2s budget, but a request that carries it from just under
// 50% to over 100% is hard-killed mid-flight (546, no catch, no chain
// continuation, row stranded in 'processing'). That is exactly how the first
// run died on a 10-card chunk. The chunk therefore has to be small enough
// that a nearly-exhausted worker can still finish one: ~0.6s at 3 cards
// against a ~1.0s worst-case remaining budget.
const CHUNK_SIZE = 3;
// Already-embedded cards cost no CPU to skip, only a SELECT — so for cached
// sets (which page by true SQL OFFSET and so tolerate any offset) we scan a
// much wider window and skip in bulk, while still capping actual embedding at
// CHUNK_SIZE. Partially-ingested sets must be walked from offset 0 to
// guarantee no gaps; without this that walk dominated the runtime. Upstream
// sets stay at CHUNK_SIZE because their paging is page-number based.
const SCAN_WINDOW = 60;
// pokemontcg.io measured at ~50% 5xx during this backlog run, so a chunk
// needs several swings to land. 5 attempts puts per-chunk failure near 3%.
// Backoff sums to 22s; with 5 requests on top this stays inside the 150s
// free-tier wall clock. Jitter avoids a synchronized retry stampede when the
// chain and the weekly cron overlap.
const RETRY_BACKOFF_MS = [1000, 3000, 6000, 12000];
const SELF_INVOKE_DELAY_MS = 1000;

// Created once at module scope and reused for the isolate's lifetime, per
// Supabase's documented pattern ("Multiple requests can use the same
// inference session"). The previous code constructed this per request.
// @ts-ignore — Supabase global, no types in the Deno LSP
const session = new Supabase.ai.Session('gte-small');

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

interface QueueRow {
  id: string;
  set_id: string;
  upstream_total: number | null;
  ingested_count: number;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
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

/** One page of CHUNK_SIZE cards from the LIVE upstream API. Only used for
 *  sets absent from set_cards_cache — see loadChunk. orderBy=id because
 *  `number` is a non-unique string upstream, not a total order, so a tie
 *  spanning a page boundary could silently drop or duplicate cards. */
async function fetchChunkUpstream(setId: string, page: number): Promise<TCGCard[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    try {
      const data = await tcgFetch(
        `https://api.pokemontcg.io/v2/cards?q=set.id:${encodeURIComponent(setId)}` +
        `&page=${page}&pageSize=${CHUNK_SIZE}&orderBy=id`
      ) as { data: TCGCard[] };
      return data.data ?? [];
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

/**
 * Source a chunk, preferring our own set_cards_cache over the upstream API.
 *
 * 57 of the 69 outstanding sets already have complete, count-verified card
 * JSON cached locally, so this avoids pokemontcg.io entirely for ~88% of the
 * backlog — the difference between grinding against a 20-50% error rate and
 * simply reading from Postgres. The upstream path stays for the 12 uncached
 * sets and for any set that appears in future.
 */
async function loadChunk(
  supabase: ReturnType<typeof makeClient>,
  setId: string,
  offset: number,
): Promise<{ cards: TCGCard[]; source: 'cache' | 'upstream' }> {
  // Pick the source ONCE per set and never switch mid-set. The two orderings
  // are genuinely different — the cached array is in upstream's default
  // (number-ish) order, while the API path uses lexicographic orderBy=id —
  // and verification showed not one outstanding cached set is id-sorted. So
  // switching sources at offset N reads a completely different slice and the
  // cache-order cards at that offset are skipped for good. Deciding up front,
  // and hard-failing instead of falling back, makes that unreachable.
  const { count, error: cacheProbeErr } = await supabase
    .from('set_cards_cache')
    .select('set_id', { count: 'exact', head: true })
    .eq('set_id', setId);

  // A failed probe must NOT be read as "not cached" — that's the silent
  // source-switch this guard exists to prevent. Fail the chunk instead; the
  // row goes to 'error' and retries cleanly from the same offset.
  if (cacheProbeErr) {
    throw new Error(`Cache probe failed for ${setId}: ${cacheProbeErr.message}`);
  }

  const isCached = (count ?? 0) > 0;

  if (isCached) {
    const { data, error } = await supabase.rpc('get_cached_card_chunk', {
      p_set_id: setId,
      p_offset: offset,
      p_limit: SCAN_WINDOW,
    });
    // No upstream fallback here by design — see above. An empty array is the
    // genuine end of the set, which the caller turns into the completion path.
    if (error) throw new Error(`get_cached_card_chunk(${setId}, ${offset}) failed: ${error.message}`);
    return { cards: (data ?? []) as TCGCard[], source: 'cache' };
  }

  const page = Math.floor(offset / CHUNK_SIZE) + 1;
  return { cards: await fetchChunkUpstream(setId, page), source: 'upstream' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();
  if (req.method !== 'POST') return err('POST only', 405);

  const supabase = makeClient();

  function selfInvokeNext(body: Record<string, unknown> = {}) {
    const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ingest-cards`;
    fetch(selfUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  try {
    const reqBody = await req.json().catch(() => ({})) as { resumeSetId?: string; noChain?: boolean };
    // noChain: test/diagnostic switch — process exactly one chunk and stop,
    // so a single invocation can be observed without starting the chain.
    const noChain = reqBody.noChain === true;

    let row: QueueRow | undefined;

    if (reqBody.resumeSetId) {
      // Mid-set continuation from this chain's own previous invocation. The
      // row is still 'processing' and lease-fresh, so claim_next_ingest_set()
      // would skip it — read it directly instead.
      const { data, error } = await supabase
        .from('ingest_queue')
        .select('id, set_id, upstream_total, ingested_count')
        .eq('id', reqBody.resumeSetId)
        .eq('status', 'processing')
        .maybeSingle();
      if (error) return err(error.message);
      row = data as QueueRow | undefined;
      // If it's no longer 'processing' (reclaimed elsewhere, or manually
      // reset) fall through to a normal claim rather than fighting over it.
    }

    if (!row) {
      const { data: claimedRows, error: claimErr } = await supabase.rpc('claim_next_ingest_set');
      if (claimErr) return err(claimErr.message);
      row = (claimedRows as QueueRow[] | null)?.[0];
    }

    if (!row) return json({ done: true, message: 'No pending sets in ingest_queue' });

    const { id: queueId, set_id: setId, upstream_total: upstreamTotal } = row;
    // ?? 0 rather than trusting the field: an undefined offset silently
    // becomes a dropped RPC param and an unmatchable PostgREST signature,
    // which degrades to "always use upstream" instead of failing loudly.
    const alreadyDone = row.ingested_count ?? 0;

    // Everything past a successful claim must end with the row in a
    // resolvable state — never left 'processing' by a JS-visible failure.
    try {
      const page = Math.floor(alreadyDone / CHUNK_SIZE) + 1;
      const { cards, source } = await loadChunk(supabase, setId, alreadyDone);

      if (cards.length === 0) {
        // No cards at this offset: the set is exhausted. Verify the total
        // actually landed before calling it done — a short/empty page from a
        // 200 response would otherwise look like clean completion.
        const { count, error: countErr } = await supabase
          .from('cards_vectors')
          .select('card_id', { count: 'exact', head: true })
          .eq('set_id', setId);
        if (countErr) throw new Error(`Count check failed: ${countErr.message}`);

        const actual = count ?? 0;
        if (upstreamTotal != null && actual < upstreamTotal) {
          throw new Error(`Incomplete: ${actual} of ${upstreamTotal} cards after exhausting pages`);
        }

        await supabase.from('ingest_queue').update({
          status: 'done',
          ingested_count: actual,
          last_error: null,
          updated_at: new Date().toISOString(),
        }).eq('id', queueId);

        if (!noChain) { await sleep(SELF_INVOKE_DELAY_MS); selfInvokeNext(); }
        return json({ setId, setComplete: true, ingested: actual, upstreamTotal });
      }

      // Embedding is the only CPU-expensive step and the sole reason for the
      // 2s-per-request ceiling, so never re-embed a card that already has an
      // embedding. This matters because partially-ingested sets are walked
      // from offset 0 (the only gap-free way to resume without assuming the
      // existing rows are an ordered prefix) — without this, ~3,600 already
      // ingested cards would be re-embedded for nothing. Skipped chunks cost
      // one SELECT instead of five inferences.
      const { data: existingRows, error: existErr } = await supabase
        .from('cards_vectors')
        .select('card_id, data_source, embedding')
        .in('card_id', cards.map((c) => c.id));
      if (existErr) throw new Error(`Existing-card lookup failed: ${existErr.message}`);

      // Skip a card if it already has an embedding (nothing to redo), OR if it
      // came from another source. The second half matters independently: this
      // function only ever writes pokemontcg.io data, and TCGdex is the sole
      // source for some sets, so overwriting one of those would silently
      // destroy the only copy that exists.
      const alreadyEmbedded = new Set(
        (existingRows ?? [])
          .filter((r) => r.embedding !== null || (r.data_source as string) !== 'pokemontcg')
          .map((r) => r.card_id as string),
      );

      const allToEmbed = cards.filter((c) => !alreadyEmbedded.has(c.id));
      // Cap actual embedding at CHUNK_SIZE regardless of how wide the scan
      // window was — the window exists to skip cheaply, not to embed more.
      const toEmbed = allToEmbed.slice(0, CHUNK_SIZE);
      const cappedOut = allToEmbed.length > CHUNK_SIZE;

      if (toEmbed.length === 0) {
        // Whole chunk already present — just advance the offset. No upsert:
        // rewriting raw_data here would clobber fresher prices that
        // refresh-prices may have written since this card was ingested.
        const skipCount = alreadyDone + cards.length;
        await supabase.from('ingest_queue').update({
          ingested_count: skipCount,
          last_error: null,
          attempts: 0, // forward progress — see the note on the embed path
          updated_at: new Date().toISOString(),
        }).eq('id', queueId);

        if (!noChain) { await sleep(SELF_INVOKE_DELAY_MS); selfInvokeNext({ resumeSetId: queueId }); }
        return json({ setId, chunk: page, source, skipped: cards.length, setProgress: `${skipCount}/${upstreamTotal ?? '?'}` });
      }

      const embeddings = await embedBatch(toEmbed.map(cardToText));

      const rows = toEmbed.map((card, i) => ({
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
        // Sets seeded from TCGdex reach this function through set_cards_cache
        // in normalized TCGCard form, so the payload itself is
        // indistinguishable from a pokemontcg.io one. Label by set id, which
        // is what makes those rows protected against a later primary-source
        // re-ingest overwriting them.
        data_source: TCGDEX_ONLY_SET_IDS.includes(setId) ? 'tcgdex' : 'pokemontcg',
      }));

      const { error: upsertErr } = await supabase
        .from('cards_vectors')
        .upsert(rows, { onConflict: 'card_id' });
      if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`);

      // Advance only as far as we've definitively handled. When the window
      // held more new cards than CHUNK_SIZE, stop just past the last one we
      // embedded so the remainder is revisited — advancing by the full window
      // there would skip them permanently. When nothing was capped out, every
      // card in the window is either newly embedded or already present, so
      // the whole window is safe to clear (and this keeps the upstream path's
      // page arithmetic aligned to CHUNK_SIZE).
      const lastEmbeddedIdx = cards.findIndex((c) => c.id === toEmbed[toEmbed.length - 1].id);
      const newCount = cappedOut ? alreadyDone + lastEmbeddedIdx + 1 : alreadyDone + cards.length;

      // Stay 'processing' with a refreshed updated_at — that keeps the lease
      // alive so the reclaim doesn't steal an actively-progressing set, while
      // still expiring it if this chain dies here.
      await supabase.from('ingest_queue').update({
        ingested_count: newCount,
        last_error: null,
        // attempts is a CONSECUTIVE-failure counter, so forward progress
        // clears it. It increments at claim time (so a hard CPU kill, which
        // runs no application code, still counts), but chains die routinely
        // from worker recycling and each restart costs a fresh claim — a
        // large set would otherwise burn through the cap on normal
        // interruptions and become permanently unclaimable despite never
        // actually failing.
        attempts: 0,
        updated_at: new Date().toISOString(),
      }).eq('id', queueId);

      if (!noChain) { await sleep(SELF_INVOKE_DELAY_MS); selfInvokeNext({ resumeSetId: queueId }); }
      return json({ setId, chunk: page, source, ingested: rows.length, setProgress: `${newCount}/${upstreamTotal ?? '?'}` });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      const { error: failErr } = await supabase.from('ingest_queue').update({
        status: 'error',
        last_error: message,
        updated_at: new Date().toISOString(),
      }).eq('id', queueId);
      if (failErr) console.error(`Failed to mark ${queueId} error (recovers via lease reclaim):`, failErr.message);

      // Chain continues to the next set — a single bad set must not stall it.
      if (!noChain) { await sleep(SELF_INVOKE_DELAY_MS); selfInvokeNext(); }
      return err(`Failed to ingest ${setId}: ${message}`);
    }
  } catch (e) {
    // Pre-claim only (DB/network failure before any row was taken) — nothing
    // claimed, so nothing to mark and nothing safe to chain into.
    console.error('Ingest error (pre-claim):', e);
    return err(e instanceof Error ? e.message : 'Internal error');
  }
});
