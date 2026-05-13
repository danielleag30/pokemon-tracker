/**
 * Fan-out card ingestion. Each invocation processes one TCG API page (250 cards),
 * embeds them with gte-small, upserts into cards_vectors, then self-invokes
 * for the next page. Idempotent via ingest_queue.
 *
 * POST { page?: number, setId?: string, forceRefresh?: boolean }
 */
import { corsResponse, json, err } from '../_shared/cors.ts';
import { makeClient, tcgFetch } from '../_shared/supabase.ts';

const PAGE_SIZE = 100;

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
  const results = await Promise.all(
    texts.map(t => session.run(t, { mean_pool: true, normalize: true }))
  );
  return results.map((r: { data: ArrayLike<number> }) => Array.from(r.data));
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();
  if (req.method !== 'POST') return err('POST only', 405);

  try {
    const body = await req.json().catch(() => ({}));
    const page: number = body.page ?? 1;
    const forceRefresh: boolean = body.forceRefresh ?? false;

    const supabase = makeClient();
    const queueId = `full-ingest-p${page}`;

    // Skip if already done
    if (!forceRefresh) {
      const { data: existing } = await supabase
        .from('ingest_queue').select('status').eq('id', queueId).single();
      if (existing?.status === 'done') return json({ skipped: true, page });
    }

    await supabase.from('ingest_queue').upsert({
      id: queueId, status: 'processing', updated_at: new Date().toISOString(),
    });

    // Fetch page from TCG API
    const data = await tcgFetch(
      `https://api.pokemontcg.io/v2/cards?page=${page}&pageSize=${PAGE_SIZE}&orderBy=id`
    ) as { data: TCGCard[]; totalCount: number; count: number; pageSize: number };

    const cards: TCGCard[] = data.data ?? [];
    if (cards.length === 0) {
      await supabase.from('ingest_queue').upsert({ id: queueId, status: 'done', total_cards: 0, processed_cards: 0, updated_at: new Date().toISOString() });
      return json({ done: true, page, total: 0 });
    }

    // Embed all cards in this page
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
      await supabase.from('ingest_queue').upsert({ id: queueId, status: 'error', last_error: upsertErr.message, updated_at: new Date().toISOString() });
      return err(upsertErr.message);
    }

    await supabase.from('ingest_queue').upsert({
      id: queueId, status: 'done', total_cards: data.totalCount, processed_cards: cards.length, updated_at: new Date().toISOString(),
    });

    // Fan out to next page if more cards exist
    const hasMore = page * PAGE_SIZE < (data.totalCount ?? 0);
    if (hasMore) {
      const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ingest-cards`;
      fetch(selfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ page: page + 1, forceRefresh }),
      }).catch(() => {});
    }

    return json({
      page,
      processed: cards.length,
      total: data.totalCount,
      hasMore,
    });
  } catch (e) {
    console.error('Ingest error:', e);
    return err(e instanceof Error ? e.message : 'Internal error');
  }
});
