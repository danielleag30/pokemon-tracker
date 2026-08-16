/**
 * Backfill prices from TCGdex for sets where pokemontcg.io carries the cards
 * but no pricing at all.
 *
 * Ascended Heroes (me2pt5, 295 cards) and Perfect Order (me3, 124) return
 * zero tcgplayer AND zero cardmarket data from the primary source — verified
 * by direct sampling — so 419 owned-or-browsable cards show no price through
 * no fault of the ingest. TCGdex has pricing for both.
 *
 * SAFETY: card ids differ between sources (`me3-1` vs `me03-001`), so this
 * maps by number and then REQUIRES the card names to match before writing.
 * A wrong price is worse than a missing one, so any mismatch is skipped and
 * counted rather than guessed at.
 *
 * Only pricing fields are touched — the rest of raw_data, the embedding, and
 * data_source are left exactly as the primary source wrote them.
 *
 * POST { setId, offset?, limit? }
 */
import { corsResponse, json, err } from '../_shared/cors.ts';
import { makeClient } from '../_shared/supabase.ts';
import { fetchTcgdexCard } from '../_shared/tcgdex.ts';

const DEFAULT_LIMIT = 40;

/** pokemontcg.io set id -> TCGdex set id, for sets present in both. */
const SET_ID_MAP: Record<string, string> = {
  me2pt5: 'me02.5',
  me3: 'me03',
};

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsResponse();
  if (req.method !== 'POST') return err('POST only', 405);

  try {
    const body = await req.json().catch(() => ({})) as
      { setId?: string; offset?: number; limit?: number; noChain?: boolean };
    const setId = body.setId;
    const offset = body.offset ?? 0;
    const limit = body.limit ?? DEFAULT_LIMIT;

    if (!setId || !(setId in SET_ID_MAP)) {
      return err(`setId must be one of: ${Object.keys(SET_ID_MAP).join(', ')}`, 400);
    }
    const tcgdexSetId = SET_ID_MAP[setId];
    const supabase = makeClient();

    const { data: rows, error: selErr } = await supabase
      .from('cards_vectors')
      .select('card_id, name, raw_data')
      .eq('set_id', setId)
      .order('card_id')
      .range(offset, offset + limit - 1);
    if (selErr) return err(selErr.message);

    if (!rows || rows.length === 0) {
      return json({ setId, done: true, offset, message: 'No more cards' });
    }

    let updated = 0, skippedNoPrice = 0, nameMismatch = 0, notFound = 0;

    for (const row of rows) {
      const cardId = row.card_id as string;
      const num = cardId.slice(setId.length + 1); // strip "me3-"
      if (!/^\d+$/.test(num)) { notFound++; continue; }
      const tcgdexId = `${tcgdexSetId}-${num.padStart(3, '0')}`;

      let card;
      try {
        card = await fetchTcgdexCard(tcgdexId);
      } catch {
        notFound++;
        continue;
      }

      // The guard that makes the number-based id mapping safe.
      if (!card.name || normalizeName(card.name) !== normalizeName(row.name as string)) {
        nameMismatch++;
        continue;
      }

      const cm = card.pricing?.cardmarket ?? {};
      const num0 = (v: unknown): number | undefined =>
        typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
      // 0 means "no figure" in TCGdex's holo keys, not a real price.
      const trend = num0(cm['trend-holo']) ?? num0(cm.trend);
      const low = num0(cm['low-holo']) ?? num0(cm.low);
      const avg = num0(cm['avg-holo']) ?? num0(cm.avg);

      if (trend === undefined && low === undefined && avg === undefined) {
        skippedNoPrice++;
        continue;
      }

      const raw = (row.raw_data ?? {}) as Record<string, unknown>;
      const merged = {
        ...raw,
        cardmarket: {
          url: '',
          updatedAt: String(cm.updated ?? ''),
          prices: { trendPrice: trend, lowPrice: low, averageSellPrice: avg },
        },
      };

      const { error: updErr } = await supabase
        .from('cards_vectors')
        .update({ raw_data: merged, prices_updated_at: new Date().toISOString() })
        .eq('card_id', cardId);
      if (updErr) { console.error(`update ${cardId} failed: ${updErr.message}`); continue; }
      updated++;
    }

    const nextOffset = offset + rows.length;
    const hasMore = rows.length === limit;

    if (hasMore && body.noChain !== true) {
      const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/tcgdex-backfill-prices`;
      fetch(selfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ setId, offset: nextOffset, limit }),
      }).catch(() => {});
    }

    return json({ setId, offset, processed: rows.length, updated, skippedNoPrice, nameMismatch, notFound, hasMore, nextOffset });
  } catch (e) {
    console.error('tcgdex-backfill-prices error:', e);
    return err(e instanceof Error ? e.message : 'Internal error');
  }
});
