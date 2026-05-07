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
}

export interface CollectionEntry {
  card_id: string;
  quantity: number;
  binder_tag: string | null;
  added_at: string;
  updated_at: string;
}

export interface CollectionStats {
  uniqueCards: number;
  totalCards: number;
  duplicates: number;
  binders: Array<{ binder_tag: string; count: number }>;
}

export type Region = 'kanto' | 'johto' | 'hoenn' | 'sinnoh' | 'unova' | 'kalos' | 'alola' | 'galar' | 'paldea';

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
