import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
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

cardsRouter.post('/scan', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: 'This is a Pokemon Trading Card Game card. Identify: 1) The exact card name, 2) The set name if visible, 3) The card number if visible (e.g. "025/102"). Respond ONLY with JSON: {"name": "...", "setName": "...", "cardNumber": "..."}. Use null for unknown fields.',
          },
        ],
      }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return res.status(422).json({ error: 'Could not parse card info from image' });

    const cardInfo = JSON.parse(jsonMatch[0]) as { name: string; setName: string | null; cardNumber: string | null };
    if (!cardInfo.name) return res.status(422).json({ error: 'Could not identify card name' });

    // Search TCG API — include card number for precision, fall back to name only
    const numberPart = cardInfo.cardNumber?.split('/')[0].replace(/^0+/, '');
    const queryWithNumber = numberPart
      ? `name:"${cardInfo.name}" number:${numberPart}`
      : `name:"${cardInfo.name}"`;

    let data = await tcgFetch(`${TCG_BASE}/cards?q=${encodeURIComponent(queryWithNumber)}&pageSize=12&orderBy=-set.releaseDate`);

    if ((!data.data || data.data.length === 0) && numberPart) {
      data = await tcgFetch(`${TCG_BASE}/cards?q=${encodeURIComponent(`name:"${cardInfo.name}"`)}&pageSize=12&orderBy=-set.releaseDate`);
    }

    res.json({ identified: cardInfo, cards: data.data ?? [] });
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
