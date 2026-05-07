import { Router, Request, Response } from 'express';
import { db } from '../database';

export const cardsRouter = Router();

const TCG_BASE = 'https://api.pokemontcg.io/v2';
// Card data is static — cache permanently, only bust via DELETE /api/cards/cache
const SETS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // sets list refreshes weekly (new sets release)

function tcgHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (process.env.POKEMON_TCG_API_KEY) h['X-Api-Key'] = process.env.POKEMON_TCG_API_KEY;
  return h;
}

function setsListValid(cachedAt: string): boolean {
  return Date.now() - new Date(cachedAt).getTime() < SETS_TTL_MS;
}

// Individual cards and set contents never change — cache forever
function cardCacheValid(cachedAt: string): boolean {
  return !!cachedAt; // always valid once cached
}

async function tcgFetch(url: string): Promise<any> {
  const res = await fetch(url, { headers: tcgHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error((data as any).message || `TCG API ${res.status}`);
  return data;
}

cardsRouter.get('/sets', async (_req: Request, res: Response) => {
  try {
    const cached = db.prepare("SELECT * FROM sets_cache WHERE cache_key = 'all_sets'").get() as any;
    if (cached && setsListValid(cached.cached_at)) return res.json(JSON.parse(cached.data));

    const data = await tcgFetch(`${TCG_BASE}/sets?orderBy=-releaseDate&pageSize=250`);

    db.prepare(`
      INSERT INTO sets_cache (cache_key, data, cached_at) VALUES ('all_sets', ?, datetime('now'))
      ON CONFLICT(cache_key) DO UPDATE SET data = ?, cached_at = datetime('now')
    `).run(JSON.stringify(data), JSON.stringify(data));

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

cardsRouter.get('/set/:setId', async (req: Request, res: Response) => {
  try {
    const { setId } = req.params;
    const cached = db.prepare('SELECT * FROM set_cards_cache WHERE set_id = ?').get(setId) as any;
    if (cached && cardCacheValid(cached.cached_at)) return res.json(JSON.parse(cached.data));

    let page = 1;
    let allCards: any[] = [];
    let hasMore = true;

    while (hasMore) {
      const data = await tcgFetch(
        `${TCG_BASE}/cards?q=set.id:${encodeURIComponent(setId)}&page=${page}&pageSize=250&orderBy=number`
      );
      allCards = [...allCards, ...data.data];
      hasMore = data.data.length === 250;
      page++;
    }

    const result = { data: allCards, count: allCards.length };
    db.prepare(`
      INSERT INTO set_cards_cache (set_id, data, card_count, cached_at) VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(set_id) DO UPDATE SET data = ?, card_count = ?, cached_at = datetime('now')
    `).run(setId, JSON.stringify(result), allCards.length, JSON.stringify(result), allCards.length);

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

cardsRouter.get('/search', async (req: Request, res: Response) => {
  try {
    const { q, page = '1', pageSize = '20' } = req.query;
    if (!q) return res.status(400).json({ error: 'q is required' });

    const data = await tcgFetch(
      `${TCG_BASE}/cards?q=${encodeURIComponent(q as string)}&page=${page}&pageSize=${pageSize}&orderBy=name`
    );
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

cardsRouter.get('/card/:cardId', async (req: Request, res: Response) => {
  try {
    const { cardId } = req.params;
    const cached = db.prepare('SELECT * FROM card_cache WHERE id = ?').get(cardId) as any;
    if (cached && cardCacheValid(cached.cached_at)) return res.json(JSON.parse(cached.data));

    const data = await tcgFetch(`${TCG_BASE}/cards/${cardId}`);
    db.prepare(`
      INSERT INTO card_cache (id, data, cached_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET data = ?, cached_at = datetime('now')
    `).run(cardId, JSON.stringify(data), JSON.stringify(data));

    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

cardsRouter.get('/pokemon/:name', async (req: Request, res: Response) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const data = await tcgFetch(
      `${TCG_BASE}/cards?q=name:"${encodeURIComponent(name)}" supertype:Pokémon&pageSize=250&orderBy=-set.releaseDate`
    );
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

cardsRouter.delete('/cache', (_req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM sets_cache').run();
    db.prepare('DELETE FROM set_cards_cache').run();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});
