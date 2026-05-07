import type { TCGCard } from '../types';

export function getMarketPrice(card: TCGCard): number | null {
  const p = card.tcgplayer?.prices;
  if (p) {
    const market =
      p.holofoil?.market ??
      p.normal?.market ??
      p.reverseHolofoil?.market ??
      p['1stEditionHolofoil']?.market ??
      p['1stEditionNormal']?.market;
    if (market != null) return market;
  }
  return card.cardmarket?.prices?.trendPrice ?? null;
}

export function formatPrice(price: number): string {
  return price >= 1000
    ? `$${(price / 1000).toFixed(1)}k`
    : `$${price.toFixed(2)}`;
}
