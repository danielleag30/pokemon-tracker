import { corsResponse, json, err } from '../_shared/cors.ts';
import { makeClient, cacheValid, tcgFetch, SETS_TTL_MS } from '../_shared/supabase.ts';
import { TCGDEX_ONLY_SET_IDS } from '../_shared/tcgdex.ts';

const TCG_BASE = 'https://api.pokemontcg.io/v2';

/**
 * Merge sets that exist only in TCGdex into the upstream set list.
 *
 * Without this, the Mega Evolution Black Star Promos are in the catalog and
 * individually reachable but absent from the set list — so there is no way to
 * navigate to them in the UI, which is the whole point of adding them. The
 * set metadata is derived from what tcgdex-seed already wrote into
 * set_cards_cache, so this needs no extra network call and stays consistent
 * with the cards actually served.
 */
async function withTcgdexOnlySets(
  supabase: ReturnType<typeof makeClient>,
  setsPayload: unknown,
): Promise<Record<string, unknown>> {
  const payload = (setsPayload ?? {}) as { data?: Array<Record<string, unknown>> };
  const existing = Array.isArray(payload.data) ? payload.data : [];
  const present = new Set(existing.map((s) => s.id as string));
  const missing = TCGDEX_ONLY_SET_IDS.filter((id) => !present.has(id));
  if (missing.length === 0) return payload as Record<string, unknown>;

  const { data: rows, error } = await supabase
    .from('set_cards_cache').select('set_id, data, card_count').in('set_id', missing);
  // Degrade to the plain upstream list rather than failing the whole endpoint:
  // a missing extra set is worse UX than an error page, but only slightly.
  if (error || !rows?.length) return payload as Record<string, unknown>;

  const extras = rows.map((row) => {
    const first = ((row.data as { data?: Array<Record<string, unknown>> })?.data ?? [])[0] ?? {};
    const setMeta = (first.set ?? {}) as Record<string, unknown>;
    return {
      id: row.set_id,
      name: setMeta.name ?? row.set_id,
      series: setMeta.series ?? 'Other',
      printedTotal: setMeta.printedTotal ?? row.card_count,
      total: row.card_count,
      releaseDate: setMeta.releaseDate ?? '',
      images: setMeta.images ?? { symbol: '', logo: '' },
    };
  });

  // Same -releaseDate ordering the upstream query requests, so the merged
  // list stays in the order every consumer already expects.
  const merged = [...existing, ...extras].sort((a, b) =>
    String(b.releaseDate ?? '').localeCompare(String(a.releaseDate ?? '')));

  return { ...payload, data: merged, totalCount: merged.length, count: merged.length };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const url = new URL(req.url);
  const path = url.pathname
    .replace(/^\/(?:functions\/v1\/)?cards\/?/, '')
    .replace(/^\//, '');
  const supabase = makeClient();

  try {
    // GET /sets
    if (req.method === 'GET' && path === 'sets') {
      const { data: cached } = await supabase
        .from('sets_cache').select('*').eq('cache_key', 'all_sets').single();

      if (cached && cacheValid(cached.cached_at, SETS_TTL_MS)) {
        return json(await withTcgdexOnlySets(supabase, cached.data));
      }

      let data: unknown;
      try {
        data = await tcgFetch(`${TCG_BASE}/sets?orderBy=-releaseDate&pageSize=250`);
      } catch (e) {
        if (cached) return json({ ...(await withTcgdexOnlySets(supabase, cached.data)), stale: true });
        throw e;
      }
      // Cache the upstream response unmodified, and merge the extras on read.
      // Persisting the merged list would mean the injected sets silently
      // vanish on the next successful refresh from upstream.
      await supabase.from('sets_cache')
        .upsert({ cache_key: 'all_sets', data, cached_at: new Date().toISOString() });
      return json(await withTcgdexOnlySets(supabase, data));
    }

    // GET /set/:setId
    if (req.method === 'GET' && path.startsWith('set/')) {
      const setId = decodeURIComponent(path.slice(4));
      const { data: cached } = await supabase
        .from('set_cards_cache').select('*').eq('set_id', setId).single();

      if (cached && cacheValid(cached.cached_at)) return json(cached.data);

      let allCards: unknown[];
      try {
        let page = 1, hasMore = true;
        allCards = [];
        while (hasMore) {
          const data = await tcgFetch(
            `${TCG_BASE}/cards?q=set.id:${encodeURIComponent(setId)}&page=${page}&pageSize=250&orderBy=number`
          ) as { data: unknown[] };
          allCards = [...allCards, ...data.data];
          hasMore = data.data.length === 250;
          page++;
        }

        // A 200 with a short/empty page mid-pagination (rather than a thrown
        // error) would otherwise look "complete" and get cached as such.
        // Cross-check against the set's known total from sets_cache when
        // available, so a truncated result is treated like an upstream
        // failure — fall back to stale cache, don't cache the gap.
        const { data: setsCache } = await supabase
          .from('sets_cache').select('data').eq('cache_key', 'all_sets').single();
        const expectedTotal = (setsCache?.data as { data?: { id: string; total: number }[] } | null)
          ?.data?.find((s) => s.id === setId)?.total;
        if (expectedTotal != null && allCards.length < expectedTotal) {
          throw new Error(`Incomplete set fetch for ${setId}: got ${allCards.length} of ${expectedTotal}`);
        }
      } catch (e) {
        if (cached) return json({ ...cached.data, stale: true });
        throw e;
      }

      const result = { data: allCards, count: allCards.length };
      await supabase.from('set_cards_cache')
        .upsert({ set_id: setId, data: result, card_count: allCards.length, cached_at: new Date().toISOString() });
      return json(result);
    }

    // GET /search?q=...
    if (req.method === 'GET' && path === 'search') {
      const q = url.searchParams.get('q');
      if (!q) return err('q is required', 400);
      const page = url.searchParams.get('page') ?? '1';
      const pageSize = url.searchParams.get('pageSize') ?? '20';
      const data = await tcgFetch(
        `${TCG_BASE}/cards?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}&orderBy=name`
      );
      return json(data);
    }

    // GET /card/:cardId
    if (req.method === 'GET' && path.startsWith('card/')) {
      const cardId = decodeURIComponent(path.slice(5));
      const { data: cached } = await supabase
        .from('card_cache').select('*').eq('id', cardId).single();

      if (cached && cacheValid(cached.cached_at)) return json(cached.data);

      let data: unknown;
      try {
        data = await tcgFetch(`${TCG_BASE}/cards/${cardId}`);
      } catch (e) {
        if (cached) return json({ ...cached.data, stale: true });
        throw e;
      }
      await supabase.from('card_cache')
        .upsert({ id: cardId, data, cached_at: new Date().toISOString() });
      return json(data);
    }

    // GET /pokemon/:name
    if (req.method === 'GET' && path.startsWith('pokemon/')) {
      const name = decodeURIComponent(path.slice(8));
      const data = await tcgFetch(
        `${TCG_BASE}/cards?q=name:"${encodeURIComponent(name)}" supertype:Pokémon&pageSize=250&orderBy=-set.releaseDate`
      );
      return json(data);
    }

    // DELETE /cache
    if (req.method === 'DELETE' && path === 'cache') {
      await Promise.all([
        supabase.from('sets_cache').delete().neq('cache_key', ''),
        supabase.from('set_cards_cache').delete().neq('set_id', ''),
      ]);
      return json({ success: true });
    }

    return err('Not found', 404);
  } catch (e) {
    return err(e instanceof Error ? e.message : 'Internal error');
  }
});
