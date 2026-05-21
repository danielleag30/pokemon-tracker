import type { RegionInfo, StarterLine, TypeColorEntry } from '../types';

export const TYPE_COLORS: Record<string, TypeColorEntry> = {
  Colorless: { bg: '#A8A878', text: '#fff', light: '#E8E8C8' },
  Darkness:  { bg: '#705848', text: '#fff', light: '#C8A888' },
  Dark:      { bg: '#705848', text: '#fff', light: '#C8A888' },
  Dragon:    { bg: '#7038F8', text: '#fff', light: '#C8A8FF' },
  Fairy:     { bg: '#EE99AC', text: '#fff', light: '#FFD8E4' },
  Fighting:  { bg: '#C03028', text: '#fff', light: '#F08878' },
  Fire:      { bg: '#F08030', text: '#fff', light: '#FFDDB0' },
  Grass:     { bg: '#78C850', text: '#fff', light: '#C8F0A8' },
  Lightning: { bg: '#F8D030', text: '#333', light: '#FFF5A0' },
  Electric:  { bg: '#F8D030', text: '#333', light: '#FFF5A0' },
  Metal:     { bg: '#B8B8D0', text: '#333', light: '#E8E8F8' },
  Steel:     { bg: '#B8B8D0', text: '#333', light: '#E8E8F8' },
  Psychic:   { bg: '#F85888', text: '#fff', light: '#FFB8D0' },
  Water:     { bg: '#6890F0', text: '#fff', light: '#B8D0FF' },
  Normal:    { bg: '#A8A878', text: '#fff', light: '#E8E8C8' },
  Poison:    { bg: '#A040A0', text: '#fff', light: '#E8A8E8' },
  Ground:    { bg: '#E0C068', text: '#333', light: '#FFF0B0' },
  Flying:    { bg: '#A890F0', text: '#fff', light: '#D8C8FF' },
  Bug:       { bg: '#A8B820', text: '#fff', light: '#E0F080' },
  Rock:      { bg: '#B8A038', text: '#fff', light: '#E8D898' },
  Ghost:     { bg: '#705898', text: '#fff', light: '#C0A8E0' },
  Ice:       { bg: '#98D8D8', text: '#333', light: '#D8F8F8' },
};

export const REGIONS: RegionInfo[] = [
  { id: 'kanto',  name: 'Kanto',  generation: 1, color: '#CC0000', emoji: '🔴', series: ['Base', 'Gym', 'Legendary'] },
  { id: 'johto',  name: 'Johto',  generation: 2, color: '#E8C000', emoji: '🌿', series: ['Neo', 'HeartGold & SoulSilver', 'Call of Legends'] },
  { id: 'hoenn',  name: 'Hoenn',  generation: 3, color: '#00AA44', emoji: '🌊', series: ['EX', 'E-Card'] },
  { id: 'sinnoh', name: 'Sinnoh', generation: 4, color: '#4466EE', emoji: '❄️', series: ['Diamond & Pearl', 'Platinum'] },
  { id: 'unova',  name: 'Unova',  generation: 5, color: '#555555', emoji: '⚫', series: ['Black & White'] },
  { id: 'kalos',  name: 'Kalos',  generation: 6, color: '#0088CC', emoji: '✨', series: ['XY'] },
  { id: 'alola',  name: 'Alola',  generation: 7, color: '#FF8800', emoji: '🌺', series: ['Sun & Moon'] },
  { id: 'galar',  name: 'Galar',  generation: 8, color: '#8800CC', emoji: '⚔️', series: ['Sword & Shield'] },
  { id: 'paldea', name: 'Paldea', generation: 9, color: '#EE4444', emoji: '🫐', series: ['Scarlet & Violet'] },
  { id: 'mega',   name: 'Mega Evolution', generation: 10, color: '#9C27B0', emoji: '💎', series: ['Mega Evolution'] },
];

export const SERIES_TO_REGION: Record<string, string> = {
  'Base': 'kanto',
  'Gym': 'kanto',
  'Legendary': 'kanto',
  'Neo': 'johto',
  'E-Card': 'hoenn',
  'EX': 'hoenn',
  'Diamond & Pearl': 'sinnoh',
  'Platinum': 'sinnoh',
  'HeartGold & SoulSilver': 'johto',
  'Call of Legends': 'johto',
  'Black & White': 'unova',
  'XY': 'kalos',
  'Sun & Moon': 'alola',
  'Sword & Shield': 'galar',
  'Scarlet & Violet': 'paldea',
  'Mega Evolution': 'mega',
};

export const STARTER_LINES: StarterLine[] = [
  { region: 'kanto',  type: 'Grass', pokemon: ['Bulbasaur',  'Ivysaur',    'Venusaur']   },
  { region: 'kanto',  type: 'Fire',  pokemon: ['Charmander', 'Charmeleon', 'Charizard']  },
  { region: 'kanto',  type: 'Water', pokemon: ['Squirtle',   'Wartortle',  'Blastoise']  },
  { region: 'johto',  type: 'Grass', pokemon: ['Chikorita',  'Bayleef',    'Meganium']   },
  { region: 'johto',  type: 'Fire',  pokemon: ['Cyndaquil',  'Quilava',    'Typhlosion'] },
  { region: 'johto',  type: 'Water', pokemon: ['Totodile',   'Croconaw',   'Feraligatr'] },
  { region: 'hoenn',  type: 'Grass', pokemon: ['Treecko',    'Grovyle',    'Sceptile']   },
  { region: 'hoenn',  type: 'Fire',  pokemon: ['Torchic',    'Combusken',  'Blaziken']   },
  { region: 'hoenn',  type: 'Water', pokemon: ['Mudkip',     'Marshtomp',  'Swampert']   },
  { region: 'sinnoh', type: 'Grass', pokemon: ['Turtwig',    'Grotle',     'Torterra']   },
  { region: 'sinnoh', type: 'Fire',  pokemon: ['Chimchar',   'Monferno',   'Infernape']  },
  { region: 'sinnoh', type: 'Water', pokemon: ['Piplup',     'Prinplup',   'Empoleon']   },
  { region: 'unova',  type: 'Grass', pokemon: ['Snivy',      'Servine',    'Serperior']  },
  { region: 'unova',  type: 'Fire',  pokemon: ['Tepig',      'Pignite',    'Emboar']     },
  { region: 'unova',  type: 'Water', pokemon: ['Oshawott',   'Dewott',     'Samurott']   },
  { region: 'kalos',  type: 'Grass', pokemon: ['Chespin',    'Quilladin',  'Chesnaught'] },
  { region: 'kalos',  type: 'Fire',  pokemon: ['Fennekin',   'Braixen',    'Delphox']    },
  { region: 'kalos',  type: 'Water', pokemon: ['Froakie',    'Frogadier',  'Greninja']   },
  { region: 'alola',  type: 'Grass', pokemon: ['Rowlet',     'Dartrix',    'Decidueye']  },
  { region: 'alola',  type: 'Fire',  pokemon: ['Litten',     'Torracat',   'Incineroar'] },
  { region: 'alola',  type: 'Water', pokemon: ['Popplio',    'Brionne',    'Primarina']  },
  { region: 'galar',  type: 'Grass', pokemon: ['Grookey',    'Thwackey',   'Rillaboom']  },
  { region: 'galar',  type: 'Fire',  pokemon: ['Scorbunny',  'Raboot',     'Cinderace']  },
  { region: 'galar',  type: 'Water', pokemon: ['Sobble',     'Drizzile',   'Inteleon']   },
  { region: 'paldea', type: 'Grass', pokemon: ['Sprigatito', 'Floragato',  'Meowscarada'] },
  { region: 'paldea', type: 'Fire',  pokemon: ['Fuecoco',    'Crocalor',   'Skeledirge'] },
  { region: 'paldea', type: 'Water', pokemon: ['Quaxly',     'Quaxwell',   'Quaquaval']  },
];

export const POKEMON_TYPES = [
  'Colorless', 'Darkness', 'Dragon', 'Fairy', 'Fighting',
  'Fire', 'Grass', 'Lightning', 'Metal', 'Psychic', 'Water',
];

// Maps raw TCG API type names to user-facing display names
export const TYPE_DISPLAY_NAMES: Record<string, string> = {
  Colorless: 'Normal',
};

export const EVOLUTION_STAGES = [
  'Basic', 'Stage 1', 'Stage 2',
  'V', 'VMAX', 'VSTAR', 'GX', 'EX', 'Mega',
  'BREAK', 'LEGEND', 'Prism Star', 'Restored',
];

export const RARITIES = [
  'Common', 'Uncommon', 'Rare', 'Rare Holo',
  'Rare Ultra', 'Rare Secret', 'Amazing Rare',
  'Rare Rainbow', 'Rare Gold', 'Illustration Rare',
  'Special Illustration Rare', 'Hyper Rare',
];
