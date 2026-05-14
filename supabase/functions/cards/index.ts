import { corsResponse, json, err } from '../_shared/cors.ts';
import { makeClient, cacheValid, tcgFetch, SETS_TTL_MS } from '../_shared/supabase.ts';

const TCG_BASE = 'https://api.pokemontcg.io/v2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/cards\/?/, '') || '';
  const supabase = makeClient();

  try {
    // GET /sets
    if (req.method === 'GET' && path === 'sets') {
      const { data: cached } = await supabase
        .from('sets_cache').select('*').eq('cache_key', 'all_sets').single();

      if (cached && cacheValid(cached.cached_at, SETS_TTL_MS)) return json(cached.data);

      const data = await tcgFetch(`${TCG_BASE}/sets?orderBy=-releaseDate&pageSize=250`);
      await supabase.from('sets_cache')
        .upsert({ cache_key: 'all_sets', data, cached_at: new Date().toISOString() });
      return json(data);
    }

    // GET /set/:setId
    if (req.method === 'GET' && path.startsWith('set/')) {
      const setId = decodeURIComponent(path.slice(4));
      const { data: cached } = await supabase
        .from('set_cards_cache').select('*').eq('set_id', setId).single();

      if (cached && cacheValid(cached.cached_at)) return json(cached.data);

      let page = 1, allCards: unknown[] = [], hasMore = true;
      while (hasMore) {
        const data = await tcgFetch(
          `${TCG_BASE}/cards?q=set.id:${encodeURIComponent(setId)}&page=${page}&pageSize=250&orderBy=number`
        ) as { data: unknown[] };
        allCards = [...allCards, ...data.data];
        hasMore = data.data.length === 250;
        page++;
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

      const data = await tcgFetch(`${TCG_BASE}/cards/${cardId}`);
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
