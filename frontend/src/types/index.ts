export interface TCGCardImages {
  small: string;
  large: string;
}

export interface TCGSetImages {
  symbol: string;
  logo: string;
}

export interface TCGSet {
  id: string;
  name: string;
  series: string;
  printedTotal: number;
  total: number;
  releaseDate: string;
  images: TCGSetImages;
}

export interface TCGPriceDetail {
  low?: number;
  mid?: number;
  high?: number;
  market?: number;
  directLow?: number;
}

export interface TCGCard {
  id: string;
  name: string;
  supertype: string;
  subtypes?: string[];
  hp?: string;
  types?: string[];
  evolvesFrom?: string;
  evolvesTo?: string[];
  images: TCGCardImages;
  set: TCGSet;
  number: string;
  rarity?: string;
  nationalPokedexNumbers?: number[];
  artist?: string;
  flavorText?: string;
  rules?: string[];
  tcgplayer?: {
    url?: string;
    updatedAt?: string;
    prices?: {
      normal?: TCGPriceDetail;
      holofoil?: TCGPriceDetail;
      reverseHolofoil?: TCGPriceDetail;
      '1stEditionHolofoil'?: TCGPriceDetail;
      '1stEditionNormal'?: TCGPriceDetail;
    };
  };
  cardmarket?: {
    url?: string;
    updatedAt?: string;
    prices?: {
      averageSellPrice?: number;
      lowPrice?: number;
      trendPrice?: number;
      avg1?: number;
      avg7?: number;
      avg30?: number;
    };
  };
}

export type FoilType = 'normal' | 'reverseHolofoil' | 'holofoil' | '1stEditionNormal' | '1stEditionHolofoil';

export const FOIL_LABELS: Record<FoilType, string> = {
  normal: 'Non-Holo',
  reverseHolofoil: 'Reverse Holo',
  holofoil: 'Holofoil',
  '1stEditionNormal': '1st Ed. Non-Holo',
  '1stEditionHolofoil': '1st Ed. Holo',
};

// Ordered most basic → most special
export const FOIL_PRIORITY: FoilType[] = [
  'normal',
  '1stEditionNormal',
  'reverseHolofoil',
  'holofoil',
  '1stEditionHolofoil',
];

export interface CollectionEntry {
  card_id: string;
  quantity: number;
  binder_tag: string | null;
  foil_type: FoilType | null;
  added_at: string;
  updated_at: string;
}

export interface CollectionStats {
  uniqueCards: number;
  totalCards: number;
  duplicates: number;
  binders: Array<{ binder_tag: string; count: number }>;
}

export type Region = 'kanto' | 'johto' | 'hoenn' | 'sinnoh' | 'unova' | 'kalos' | 'alola' | 'galar' | 'paldea' | 'mega';

export interface RegionInfo {
  id: Region;
  name: string;
  generation: number;
  color: string;
  emoji: string;
  series: string[];
}

export interface StarterLine {
  region: Region;
  type: 'Grass' | 'Fire' | 'Water';
  pokemon: [string, string, string];
}

export interface TypeColorEntry {
  bg: string;
  text: string;
  light: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  cardIds?: string[];
  imagePreview?: string;
}

export interface ChatPageContext {
  page?: string;
  setId?: string;
  regionId?: string;
  visibleCardIds?: string[];
}
