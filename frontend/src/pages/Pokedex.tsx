import { useState, useMemo } from 'react';
import { ChevronLeft, Loader } from 'lucide-react';
import { POKEMON_LIST, pokemonSpriteUrl, formatDexNumber } from '../utils/pokemon';
import type { PokemonEntry } from '../utils/pokemon';
import { usePokemonCards, useOwnedPokemonNames } from '../hooks/useCards';
import { useCollectionMap } from '../hooks/useCollection';
import { CardGrid } from '../components/CardGrid';
import { SearchBar } from '../components/SearchBar';

const PAGE_SIZE = 20;

export function Pokedex() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<PokemonEntry | null>(null);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  const collectionMap = useCollectionMap();
  const ownedNames = useOwnedPokemonNames();
  const binderTags = useMemo(() => {
    const tags = new Set<string>();
    collectionMap.forEach((e) => { if (e.binder_tag) tags.add(e.binder_tag); });
    return Array.from(tags);
  }, [collectionMap]);

  // ── Layer 1: filtered list (must be before any early return) ────────────
  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return POKEMON_LIST;
    if (q.startsWith('#') || q.match(/^\d+$/)) {
      const numStr = q.startsWith('#') ? q.slice(1) : q;
      return POKEMON_LIST.filter((p) => {
        const raw = String(p.id);
        const padded = raw.padStart(4, '0');
        return raw.startsWith(numStr) || padded.startsWith(numStr);
      });
    }
    return POKEMON_LIST.filter((p) => p.name.toLowerCase().includes(q));
  }, [search]);

  // ── Layer 2: cards for selected Pokémon ──────────────────────────────────
  const { data: pokemonCardsData, isLoading: cardsLoading } = usePokemonCards(
    selected?.name ?? '',
    !!selected
  );

  const allCards = pokemonCardsData?.data ?? [];
  const displayedCards = allCards.slice(0, displayCount);
  const ownedInPokemon = allCards.filter((c) => collectionMap.has(c.id)).length;
  const remaining = allCards.length - displayCount;

  if (selected) {
    return (
      <div className="space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => { setSelected(null); setDisplayCount(PAGE_SIZE); }}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <img
            src={pokemonSpriteUrl(selected.id)}
            alt={selected.name}
            className="w-12 h-12 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-gray-900">{selected.name}</h1>
            <p className="text-xs text-gray-400">{formatDexNumber(selected.id)}</p>
          </div>
          {!cardsLoading && allCards.length > 0 && (
            <div className="text-sm font-semibold text-gray-500">
              <span className="text-pokemon-blue">{ownedInPokemon}</span>
              <span className="text-gray-400"> / {allCards.length} owned</span>
            </div>
          )}
        </div>

        {/* Card grid */}
        {cardsLoading ? (
          <div className="flex items-center gap-2 text-gray-500 py-16 justify-center">
            <Loader size={20} className="animate-spin" /> Loading cards…
          </div>
        ) : (
          <>
            {allCards.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <span className="text-4xl mb-3">🔍</span>
                <p className="text-sm">No TCG cards found for {selected.name}</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-400">
                  {allCards.length} card{allCards.length !== 1 ? 's' : ''} across all sets
                  {displayCount < allCards.length ? ` · showing ${displayCount}` : ''}
                </p>
                <CardGrid
                  cards={displayedCards}
                  collectionMap={collectionMap}
                  binderTags={binderTags}
                  emptyMessage="No cards found."
                />
                {remaining > 0 && (
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={() => setDisplayCount((c) => c + PAGE_SIZE)}
                      className="px-6 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
                    >
                      Show {Math.min(remaining, PAGE_SIZE)} more
                      <span className="ml-1 text-gray-400">({remaining} left)</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Layer 1: Pokémon list ─────────────────────────────────────────────────
  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Pokédex</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {POKEMON_LIST.length} Pokémon · select one to see all their TCG cards
        </p>
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by name or number (e.g. #006)…"
      />

      {filteredList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <span className="text-4xl mb-3">🔍</span>
          <p className="text-sm">No Pokémon match "{search}"</p>
        </div>
      ) : (
        <>
          <p className="text-xs text-gray-400">
            {filteredList.length} Pokémon{search ? ' match your search' : ''}
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {filteredList.map((pokemon) => {
              const isOwned = ownedNames.has(pokemon.name);
              return (
                <button
                  key={pokemon.id}
                  onClick={() => { setSelected(pokemon); setDisplayCount(PAGE_SIZE); }}
                  className={`relative flex flex-col items-center gap-1 p-2 rounded-xl border transition-all hover:shadow-md hover:-translate-y-0.5 bg-white text-center ${
                    isOwned
                      ? 'border-yellow-300 ring-2 ring-yellow-300/50'
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  {isOwned && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-pokemon-yellow" />
                  )}
                  <img
                    src={pokemonSpriteUrl(pokemon.id)}
                    alt={pokemon.name}
                    loading="lazy"
                    className="w-10 h-10 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='18' fill='%23e5e7eb'/%3E%3C/svg%3E";
                    }}
                  />
                  <span className="text-gray-400 text-xs leading-none">{formatDexNumber(pokemon.id)}</span>
                  <span className="text-gray-700 text-xs font-semibold leading-tight line-clamp-2">{pokemon.name}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
