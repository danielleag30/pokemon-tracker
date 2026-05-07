import { useState, useMemo } from 'react';
import { ChevronLeft, Loader } from 'lucide-react';
import { useSets, useSetCards } from '../hooks/useCards';
import { useCollectionMap } from '../hooks/useCollection';
import { ProgressBar } from '../components/ProgressBar';
import { CardGrid } from '../components/CardGrid';
import { SearchBar } from '../components/SearchBar';
import { REGIONS, SERIES_TO_REGION } from '../utils/constants';
import type { TCGSet } from '../types';

export function BySet() {
  const [selectedSet, setSelectedSet] = useState<TCGSet | null>(null);
  const [setSearch, setSetSearch] = useState('');
  const [seriesFilter, setSeriesFilter] = useState('');
  const [cardSearch, setCardSearch] = useState('');
  const [cardFilter, setCardFilter] = useState<'all' | 'owned' | 'missing'>('all');

  const { data: setsData, isLoading: setsLoading } = useSets();
  const { data: setCardsData, isLoading: cardsLoading } = useSetCards(selectedSet?.id ?? null);
  const collectionMap = useCollectionMap();

  const sets = setsData?.data ?? [];
  const allCards = setCardsData?.data ?? [];

  const binderTags = Array.from(new Set(
    Array.from(collectionMap.values()).map((e) => e.binder_tag).filter(Boolean) as string[]
  ));

  // Unique series for the filter pills
  const allSeries = useMemo(
    () => Array.from(new Set(sets.map((s) => s.series))).sort(),
    [sets]
  );

  const filteredSets = sets.filter((s) => {
    const matchSearch = !setSearch ||
      s.name.toLowerCase().includes(setSearch.toLowerCase()) ||
      s.series.toLowerCase().includes(setSearch.toLowerCase());
    const matchSeries = !seriesFilter || s.series === seriesFilter;
    return matchSearch && matchSeries;
  });

  const ownedInSet = allCards.filter((c) => collectionMap.has(c.id)).length;

  const filteredCards = allCards.filter((c) => {
    const matchSearch = !cardSearch ||
      c.name.toLowerCase().includes(cardSearch.toLowerCase()) ||
      c.number.includes(cardSearch);
    const owned = collectionMap.has(c.id);
    const matchFilter =
      cardFilter === 'all' ||
      (cardFilter === 'owned' && owned) ||
      (cardFilter === 'missing' && !owned);
    return matchSearch && matchFilter;
  });

  const regionForSet = (set: TCGSet) =>
    REGIONS.find((r) => r.id === SERIES_TO_REGION[set.series]);

  // ── Set list ──────────────────────────────────────────────────────────────
  if (!selectedSet) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Browse by Set</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {sets.length > 0 ? `${sets.length} sets — pick any one to see its cards` : 'Loading sets…'}
          </p>
        </div>

        <SearchBar
          value={setSearch}
          onChange={setSetSearch}
          placeholder="Search sets by name or series…"
        />

        {/* Series filter pills */}
        {allSeries.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSeriesFilter('')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                !seriesFilter
                  ? 'bg-pokemon-blue text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              All
            </button>
            {allSeries.map((series) => {
              const region = REGIONS.find((r) => r.id === SERIES_TO_REGION[series]);
              return (
                <button
                  key={series}
                  onClick={() => setSeriesFilter(series === seriesFilter ? '' : series)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors flex items-center gap-1 ${
                    seriesFilter === series
                      ? 'text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                  style={seriesFilter === series && region ? { backgroundColor: region.color } : {}}
                >
                  {region && <span>{region.emoji}</span>}
                  {series}
                </button>
              );
            })}
          </div>
        )}

        <p className="text-xs text-gray-400">
          {filteredSets.length} set{filteredSets.length !== 1 ? 's' : ''}
          {setSearch || seriesFilter ? ' match your filter' : ''}
        </p>

        {setsLoading ? (
          <div className="flex items-center gap-2 text-gray-500 py-12 justify-center">
            <Loader size={18} className="animate-spin" /> Loading sets…
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredSets.map((set) => {
              const region = regionForSet(set);
              const owned = Array.from(collectionMap.keys()).filter((id) =>
                id.startsWith(set.id + '-')
              ).length;
              return (
                <button
                  key={set.id}
                  onClick={() => { setSelectedSet(set); setCardSearch(''); setCardFilter('all'); }}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all text-left"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <img
                      src={set.images.symbol}
                      alt=""
                      className="w-8 h-8 object-contain shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-gray-800 text-sm truncate">{set.name}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        {region && <span>{region.emoji}</span>}
                        {set.series} · {set.releaseDate} · {set.printedTotal} cards
                      </p>
                    </div>
                  </div>
                  <ProgressBar
                    value={owned}
                    max={set.printedTotal}
                    color={region?.color ?? '#3B4CCA'}
                    height="sm"
                  />
                </button>
              );
            })}

            {filteredSets.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-400">
                <span className="text-4xl mb-2">🔍</span>
                <p className="text-sm">No sets match "{setSearch || seriesFilter}"</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Card grid for selected set ────────────────────────────────────────────
  const region = regionForSet(selectedSet);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setSelectedSet(null)}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <img
          src={selectedSet.images.logo}
          alt={selectedSet.name}
          className="h-8 object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black text-gray-900 truncate">{selectedSet.name}</h1>
          <p className="text-xs text-gray-400 flex items-center gap-1">
            {region && <span>{region.emoji}</span>}
            {selectedSet.series} · {selectedSet.releaseDate} · {selectedSet.printedTotal} cards
          </p>
        </div>
      </div>

      {!cardsLoading && allCards.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <ProgressBar
            value={ownedInSet}
            max={allCards.length}
            color={region?.color ?? '#3B4CCA'}
            label={`${selectedSet.name} completion`}
          />
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-48">
          <SearchBar
            value={cardSearch}
            onChange={setCardSearch}
            placeholder="Search by name or number…"
          />
        </div>
        <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm">
          {(['all', 'owned', 'missing'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setCardFilter(f)}
              className={`px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                cardFilter === f ? 'bg-pokemon-blue text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {cardsLoading ? (
        <div className="flex items-center gap-2 text-gray-500 py-12 justify-center">
          <Loader size={20} className="animate-spin" /> Loading cards…
        </div>
      ) : (
        <CardGrid
          cards={filteredCards}
          collectionMap={collectionMap}
          binderTags={binderTags}
          emptyMessage="No cards match your filter."
        />
      )}
    </div>
  );
}
