import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useCollectionMap } from '../hooks/useCollection';
import { usePokemonCards } from '../hooks/useCards';
import { useAddCard, useRemoveCard } from '../hooks/useCollection';
import { TypeBadge } from '../components/TypeBadge';
import { SearchBar } from '../components/SearchBar';
import { STARTER_LINES, REGIONS } from '../utils/constants';
import type { TCGCard } from '../types';

function StarterCard({ name, collectionMap }: { name: string; collectionMap: Map<string, any> }) {
  const { data, isLoading } = usePokemonCards(name, true);
  const addCard = useAddCard();
  const removeCard = useRemoveCard();

  const cards = (data?.data ?? []).filter((c: TCGCard) => c.supertype === 'Pokémon').slice(0, 6);
  const ownedCount = cards.filter((c: TCGCard) => collectionMap.has(c.id)).length;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-1 w-28">
        <div className="w-20 h-28 bg-gray-100 rounded-xl animate-pulse" />
        <div className="h-3 bg-gray-100 rounded w-16 animate-pulse" />
      </div>
    );
  }

  const bestCard = cards.find((c: TCGCard) => collectionMap.has(c.id)) ?? cards[0];

  return (
    <div className="flex flex-col items-center gap-1 w-28">
      <div className={`relative rounded-xl overflow-hidden shadow-md w-20 h-28 bg-gray-100 ${
        ownedCount > 0 ? 'ring-2 ring-green-400' : 'opacity-60'
      }`}>
        {bestCard?.images.small ? (
          <img src={bestCard.images.small} alt={name} className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl">🃏</div>
        )}
        {ownedCount > 0 && (
          <div className="absolute bottom-1 right-1 bg-green-400 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {ownedCount}
          </div>
        )}
      </div>
      <p className="text-xs font-semibold text-gray-700 text-center leading-tight">{name}</p>
      {bestCard && (
        <button
          onClick={() =>
            ownedCount > 0
              ? removeCard.mutate(bestCard.id)
              : addCard.mutate({ cardId: bestCard.id })
          }
          disabled={addCard.isPending || removeCard.isPending}
          className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
            ownedCount > 0
              ? 'bg-red-100 text-red-600 hover:bg-red-200'
              : 'bg-pokemon-blue text-white hover:bg-blue-700'
          }`}
        >
          {ownedCount > 0 ? '✓ Owned' : '+ Add'}
        </button>
      )}
    </div>
  );
}

export function ByStarter() {
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const collectionMap = useCollectionMap();

  const q = search.toLowerCase();

  // A line matches if any Pokemon name in it contains the search term
  const lineMatches = (pokemon: string[]) =>
    !q || pokemon.some((name) => name.toLowerCase().includes(q));

  const lines = STARTER_LINES.filter((l) => {
    const regionMatch = !selectedRegion || l.region === selectedRegion;
    const searchMatch = lineMatches(l.pokemon);
    return regionMatch && searchMatch;
  });

  const grouped = lines.reduce<Record<string, typeof STARTER_LINES>>((acc, line) => {
    if (!acc[line.region]) acc[line.region] = [];
    acc[line.region].push(line);
    return acc;
  }, {});

  const matchCount = lines.reduce((acc, l) => acc + l.pokemon.length, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Starter Pokémon</h1>
        <p className="text-sm text-gray-500 mt-0.5">All starter evolution lines across every generation</p>
      </div>

      {/* Search */}
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by Pokémon name e.g. Charizard, Piplup…"
      />

      {search && (
        <p className="text-xs text-gray-500 -mt-2">
          {matchCount} Pokémon across {lines.length} line{lines.length !== 1 ? 's' : ''}
          {selectedRegion ? ` in ${REGIONS.find((r) => r.id === selectedRegion)?.name}` : ''}
        </p>
      )}

      {/* Region filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedRegion(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            !selectedRegion ? 'bg-pokemon-blue text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          All Regions
        </button>
        {REGIONS.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelectedRegion(r.id === selectedRegion ? null : r.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1 ${
              selectedRegion === r.id ? 'text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
            style={selectedRegion === r.id ? { backgroundColor: r.color } : {}}
          >
            {r.emoji} {r.name}
          </button>
        ))}
      </div>

      {lines.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <span className="text-5xl mb-3">🔍</span>
          <p className="text-sm">No starter lines match "{search}"</p>
        </div>
      )}

      {/* Evolution lines grouped by region */}
      {Object.entries(grouped).map(([regionId, regionLines]) => {
        const region = REGIONS.find((r) => r.id === regionId);
        return (
          <div key={regionId} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="font-black text-gray-800 mb-4 flex items-center gap-2">
              <span>{region?.emoji}</span>
              <span>{region?.name}</span>
              <span className="text-gray-400 font-normal text-sm">Gen {region?.generation}</span>
            </h2>

            <div className="space-y-6">
              {regionLines.map((line) => {
                // Highlight matching Pokemon when searching
                const highlighted = q
                  ? line.pokemon.filter((n) => n.toLowerCase().includes(q))
                  : line.pokemon;

                return (
                  <div key={`${line.region}-${line.type}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <TypeBadge type={line.type} size="md" />
                      <span className="text-xs text-gray-400">Starter Line</span>
                      {q && highlighted.length < line.pokemon.length && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                          {highlighted.join(', ')} matched
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {line.pokemon.map((name, i) => (
                        <div key={name} className="flex items-center gap-2">
                          <div className={q && !name.toLowerCase().includes(q) ? 'opacity-30' : ''}>
                            <StarterCard name={name} collectionMap={collectionMap} />
                          </div>
                          {i < line.pokemon.length - 1 && (
                            <ChevronRight size={20} className="text-gray-300 shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
