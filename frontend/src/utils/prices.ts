import type { TCGCard } from '../types';
import { FOIL_PRIORITY, type FoilType } from '../types';

export function getAvailableTiers(card: TCGCard): FoilType[] {
  const p = card.tcgplayer?.prices;
  if (!p) return [];
  return FOIL_PRIORITY.filter((tier) => p[tier]?.market != null);
}

// Returns the most basic version available for this specific card
export function getDefaultTier(card: TCGCard): FoilType | null {
  return getAvailableTiers(card)[0] ?? null;
}

export function getMarketPrice(card: TCGCard, foilType?: FoilType | null): number | null {
  const p = card.tcgplayer?.prices;
  if (p) {
    const tier = foilType ?? getDefaultTier(card);
    if (tier && p[tier]?.market != null) return p[tier]!.market!;
    for (const t of FOIL_PRIORITY) {
      if (p[t]?.market != null) return p[t]!.market!;
    }
  }
  return card.cardmarket?.prices?.trendPrice ?? null;
}

export function formatPrice(price: number): string {
  return price >= 1000
    ? `$${(price / 1000).toFixed(1)}k`
    : `$${price.toFixed(2)}`;
}
