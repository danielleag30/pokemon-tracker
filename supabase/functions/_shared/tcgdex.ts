/**
 * TCGdex client + normalizer.
 *
 * WHY THIS EXISTS: pokemontcg.io — the app's primary catalog source — has no
 * Mega Evolution Black Star Promos set. Verified directly: `q=set.id:mep`
 * returns 0 results, and its newest promo set of any kind is `svp` from 2023.
 * That is why those cards were missing from the tracker; no amount of
 * re-ingesting from the primary source could ever produce them. TCGdex does
 * carry the set (`mep`, 60 cards) with pricing, so it's used as a secondary
 * source for sets the primary lacks.
 *
 * The normalizer converts TCGdex's shape into the `TCGCard` shape the rest of
 * the app already expects (frontend/src/types), so no consumer needs to know
 * or care which upstream a card came from.
 */

const TCGDEX_BASE = 'https://api.tcgdex.net/v2/en';
const TCGDEX_ASSETS = 'https://assets.tcgdex.net/en';

/** Sets carried by TCGdex that pokemontcg.io does not have at all. Kept
 *  explicit rather than inferred: TCGdex has ~218 sets to pokemontcg.io's
 *  174, and silently pulling in every difference would change what the app
 *  shows well beyond the reported problem. */
export const TCGDEX_ONLY_SET_IDS = ['mep'];

export interface TCGdexCardRef { id: string; localId: string; name: string }

export interface TCGdexSet {
  id: string;
  name: string;
  serie?: { id: string; name: string };
  releaseDate?: string;
  cardCount?: { total?: number; official?: number };
  cards?: TCGdexCardRef[];
}

export interface TCGdexCard {
  id: string;
  localId: string;
  name?: string;
  category?: string;
  rarity?: string;
  hp?: number;
  types?: string[];
  stage?: string;
  evolveFrom?: string;
  dexId?: number[];
  illustrator?: string;
  set?: { id: string; name: string };
  pricing?: {
    cardmarket?: Record<string, number | string | undefined>;
    tcgplayer?: Record<string, unknown> | null;
  };
}

async function tcgdexFetch(path: string): Promise<unknown> {
  const res = await fetch(`${TCGDEX_BASE}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`TCGdex ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  return res.json();
}

export function fetchTcgdexSet(setId: string): Promise<TCGdexSet> {
  return tcgdexFetch(`/sets/${encodeURIComponent(setId)}`) as Promise<TCGdexSet>;
}

export function fetchTcgdexCard(cardId: string): Promise<TCGdexCard> {
  return tcgdexFetch(`/cards/${encodeURIComponent(cardId)}`) as Promise<TCGdexCard>;
}

/** TCGdex's `Pokemon` vs the app's `Pokémon` (which is what every existing
 *  supertype filter and the RAG text builder match against). */
function normalizeSupertype(category?: string): string {
  if (!category) return 'Pokémon';
  if (category.toLowerCase() === 'pokemon') return 'Pokémon';
  return category;
}

/**
 * Card images. The API's `image` field is null for every MEP card, but the
 * conventional asset path resolves for most of them (real image/webp
 * responses of 90-135KB). It does NOT resolve for all: 20 of MEP's 60 cards
 * have no asset at any variant or extension (mep 032-036, 064-071, 074-080).
 * Emitting a constructed URL for those produced a broken image in the UI, so
 * `verifyImages` HEAD-checks and returns empty strings when nothing is there,
 * letting consumers render a proper placeholder instead.
 */
function buildImages(serieId: string, setId: string, localId: string) {
  const base = `${TCGDEX_ASSETS}/${serieId}/${setId}/${localId}`;
  return { small: `${base}/low.webp`, large: `${base}/high.webp` };
}

async function imageExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * TCGdex card -> the app's TCGCard shape.
 *
 * Pricing: TCGdex exposes cardmarket only (tcgplayer is null on these cards),
 * and its values are EUR. That is mapped onto `cardmarket.prices.trendPrice`,
 * which is exactly where the existing getMarketPrice() fallback already looks
 * and already treats pokemontcg.io's own EUR cardmarket data the same way —
 * so this introduces no new currency inconsistency.
 */
export function normalizeTcgdexCard(
  card: TCGdexCard,
  set: TCGdexSet,
): Record<string, unknown> {
  const serieId = set.serie?.id ?? 'unknown';
  const cm = card.pricing?.cardmarket ?? {};
  // Treats 0 as "no price", not as a price. TCGdex populates holo-specific
  // keys with a literal 0 rather than omitting them when it has no holo
  // figure — mep-001 reports trend-holo: 0 alongside a real trend: 19 — so a
  // plain `??` chain would let the placeholder shadow the genuine price and
  // every MEP card would display as free.
  const num = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;

  // Prefer holo figures where they're real: these cards are holo-only
  // (cardCount reports holo:88, normal:0), so when TCGdex does supply a holo
  // price it's the more accurate one.
  const trend = num(cm['trend-holo']) ?? num(cm.trend);
  const low = num(cm['low-holo']) ?? num(cm.low);
  const avg = num(cm['avg-holo']) ?? num(cm.avg);

  const hasPricing = trend !== undefined || low !== undefined || avg !== undefined;

  return {
    id: card.id,
    name: card.name ?? card.id,
    supertype: normalizeSupertype(card.category),
    subtypes: card.stage ? [card.stage] : [],
    hp: card.hp != null ? String(card.hp) : undefined,
    types: card.types ?? [],
    evolvesFrom: card.evolveFrom,
    number: card.localId,
    rarity: card.rarity,
    artist: card.illustrator,
    nationalPokedexNumbers: card.dexId ?? [],
    images: buildImages(serieId, set.id, card.localId),
    set: {
      id: set.id,
      name: set.name,
      series: set.serie?.name ?? 'Other',
      // `||` not `??`: TCGdex reports cardCount.official = 0 for MEP, and ??
      // preserves that 0 — which the set/series progress UI reads as "0
      // cards", rendering the set as 0/0 (0%) and undercounting the Mega
      // Evolution series by 60.
      printedTotal: set.cardCount?.official || set.cardCount?.total || 0,
      total: set.cardCount?.total ?? 0,
      releaseDate: (set.releaseDate ?? '').replace(/-/g, '/'),
      images: { symbol: '', logo: '' },
    },
    ...(hasPricing
      ? {
          cardmarket: {
            url: '',
            updatedAt: String(cm.updated ?? ''),
            prices: {
              trendPrice: trend,
              lowPrice: low,
              averageSellPrice: avg,
              avg1: num(cm['avg1-holo']) ?? num(cm.avg1),
              avg7: num(cm['avg7-holo']) ?? num(cm.avg7),
              avg30: num(cm['avg30-holo']) ?? num(cm.avg30),
            },
          },
        }
      : {}),
  };
}

/** Full set as normalized TCGCards. Cards are enumerated from the set
 *  listing rather than by generating sequential ids — MEP's 60 cards are
 *  sparsely numbered up to mep-080, so generated ids would 404. */
export async function fetchNormalizedTcgdexSet(
  setId: string,
): Promise<{ set: TCGdexSet; cards: Record<string, unknown>[] }> {
  const set = await fetchTcgdexSet(setId);
  const refs = set.cards ?? [];
  const cards: Record<string, unknown>[] = [];
  for (const ref of refs) {
    try {
      const full = await fetchTcgdexCard(ref.id);
      const card = normalizeTcgdexCard(full, set);

      // Don't ship a URL that 404s — 20 of MEP's 60 cards have no asset at
      // any variant. Blank them so consumers can render a placeholder rather
      // than a broken image.
      const images = card.images as { small: string; large: string };
      if (!(await imageExists(images.large))) {
        card.images = { small: '', large: '' };
      }

      cards.push(card);
    } catch (e) {
      // Skip individual bad cards rather than losing the whole set; the
      // caller's count check surfaces any shortfall.
      console.error(`TCGdex card ${ref.id} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return { set, cards };
}
