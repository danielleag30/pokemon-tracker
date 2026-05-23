import { useState } from 'react';
import { Loader } from 'lucide-react';
import { useCollectionMap } from '../hooks/useCollection';
import { useSetCards, useSets, useCardSearch } from '../hooks/useCards';
import { TypeBadge } from '../components/TypeBadge';
import { CardGrid } from '../components/CardGrid';
import { SearchBar } from '../components/SearchBar';
import { ProgressBar } from '../components/ProgressBar';
import { POKEMON_TYPES, TYPE_COLORS, TYPE_DISPLAY_NAMES, REGIONS, SERIES_TO_REGION } from '../utils/constants';

export function ByType() {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [typeSearch, setTypeSearch] = useState('');   // layer 1: filter the type pills
  const [cardSearch, setCardSearch] = useState('');   // layer 2: search within type
  const [browseSetId, setBrowseSetId] = useState('');
  const [filter, setFilter] = useState<'all' | 'owned' | 'missing'>('all');
  const [regionFilter, setRegionFilter] = useState<string>('');

  const collectionMap = useCollectionMap();
  const { data: setsData } = useSets();
  const { data: setCardsData, isLoading: cardsLoading } = useSetCards(browseSetId || null);

  // Cross-set search: fires as soon as a type is selected; narrows when name is typed
  const crossQuery = selectedType
    ? `types:${selectedType}${cardSearch.length >= 2 ? ` name:${cardSearch}` : ''}`
    : '';
  const { data: crossResults, isFetching: crossLoading } = useCardSearch(crossQuery, !!crossQuery);

  const sets = setsData?.data ?? [];
  const setCards = setCardsData?.data ?? [];

  const binderTags = Array.from(new Set(
    Array.from(collectionMap.values()).map((e) => e.binder_tag).filter(Boolean) as string[]
  ));

  // Filter type pills by layer-1 search
  const visibleTypes = POKEMON_TYPES.filter((t) =>
    !typeSearch || t.toLowerCase().includes(typeSearch.toLowerCase())
  );

  // Cards from selected set filtered by type + card search + owned filter
  const setFilteredCards = setCards.filter((c) => {
    const matchType = c.types?.includes(selectedType ?? '');
    const matchSearch = !cardSearch || c.name.toLowerCase().includes(cardSearch.toLowerCase());
    const owned = collectionMap.has(c.id);
    const matchFilter = filter === 'all' || (filter === 'owned' && owned) || (filter === 'missing' && !owned);
    return matchType && matchSearch && matchFilter;
  });

  const ownedInSet = setCards.filter((c) => c.types?.includes(selectedType ?? '') && collectionMap.has(c.id)).length;
  const totalInSet = setCards.filter((c) => c.types?.includes(selectedType ?? '')).length;

  // Cross-set results filtered by owned/missing + region
  const crossCards = (crossResults?.data ?? []).filter((c) => {
    const owned = collectionMap.has(c.id);
    const matchFilter = filter === 'all' || (filter === 'owned' && owned) || (filter === 'missing' && !owned);
    const matchRegion = !regionFilter || SERIES_TO_REGION[c.set.series] === regionFilter;
    return matchFilter && matchRegion;
  });

  const showCrossSearch = !!selectedType;
  const showSetBrowse = selectedType && !cardSearch;

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Browse by Type</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {selectedType
            ? `Showing ${TYPE_DISPLAY_NAMES[selectedType] ?? selectedType} cards — filter by series, search by name, or pick a set`
            : 'Select a type to explore cards'}
        </p>
      </div>

      {/* Layer 1: Type selector with its own search */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pokémon Types</p>
          <div className="flex-1 max-w-48">
            <SearchBar
              value={typeSearch}
              onChange={setTypeSearch}
              placeholder="Filter types…"
              debounceMs={0}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {visibleTypes.map((type) => {
            const colors = TYPE_COLORS[type];
            const isSelected = selectedType === type;
            return (
              <button
                key={type}
                onClick={() => { setSelectedType(isSelected ? null : type); setCardSearch(''); setBrowseSetId(''); setRegionFilter(''); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:scale-105 ${
                  isSelected ? 'scale-105 shadow-md' : 'opacity-80 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: isSelected ? colors.bg : colors.light,
                  color: isSelected ? colors.text : '#555',
                  outline: isSelected ? `3px solid ${colors.bg}` : 'none',
                  outlineOffset: '2px',
                }}
              >
                {TYPE_DISPLAY_NAMES[type] ?? type}
              </button>
            );
          })}
          {visibleTypes.length === 0 && (
            <p className="text-sm text-gray-400">No types match "{typeSearch}"</p>
          )}
        </div>
      </div>

      {/* Layer 2: Card search + set picker once a type is chosen */}
      {selectedType && (
        <>
          <div className="flex gap-3 flex-wrap items-center">
            <div className="flex-1 min-w-48">
              <SearchBar
                value={cardSearch}
                onChange={setCardSearch}
                placeholder={`Search ${TYPE_DISPLAY_NAMES[selectedType] ?? selectedType} cards by name across all sets…`}
              />
            </div>
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-pokemon-blue/30 shrink-0"
            >
              <option value="">All Series</option>
              {REGIONS.map((r) => (
                <option key={r.id} value={r.id}>{r.emoji} {r.name}</option>
              ))}
            </select>
            <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm shrink-0">
              {(['all', 'owned', 'missing'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                    filter === f ? 'bg-pokemon-blue text-white' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Cross-set results — loads on type select, narrows on name search */}
          {showCrossSearch && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TypeBadge type={selectedType} size="md" />
                <p className="text-xs text-gray-500 font-medium">
                  {cardSearch.length >= 2
                    ? `Results for "${cardSearch}"`
                    : `All ${TYPE_DISPLAY_NAMES[selectedType] ?? selectedType} cards`}
                  {regionFilter ? ` · ${REGIONS.find((r) => r.id === regionFilter)?.name}` : ''}
                </p>
              </div>
              {crossLoading ? (
                <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
                  <Loader size={18} className="animate-spin" /> Loading…
                </div>
              ) : (
                <CardGrid
                  cards={crossCards}
                  collectionMap={collectionMap}
                  binderTags={binderTags}
                  emptyMessage={`No ${TYPE_DISPLAY_NAMES[selectedType] ?? selectedType} cards found${cardSearch ? ` named "${cardSearch}"` : ''}${regionFilter ? ` in ${REGIONS.find((r) => r.id === regionFilter)?.name}` : ''}.`}
                />
              )}
            </div>
          )}

          {/* Set picker for browsing without a search term */}
          {showSetBrowse && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <label className="text-xs font-semibold text-gray-500 mb-2 block uppercase tracking-wide">
                Or browse a specific set
              </label>
              <select
                value={browseSetId}
                onChange={(e) => setBrowseSetId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pokemon-blue/30"
              >
                <option value="">— Pick a set —</option>
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.series})</option>
                ))}
              </select>
            </div>
          )}

          {/* Set-scoped results */}
          {showSetBrowse && browseSetId && (
            <>
              {totalInSet > 0 && (
                <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 flex items-center gap-3">
                  <TypeBadge type={selectedType} size="lg" />
                  <ProgressBar value={ownedInSet} max={totalInSet} color={TYPE_COLORS[selectedType]?.bg} showPercent />
                </div>
              )}
              {cardsLoading ? (
                <div className="flex items-center gap-2 text-gray-500 justify-center py-12">
                  <Loader size={20} className="animate-spin" /> Loading cards…
                </div>
              ) : (
                <CardGrid
                  cards={setFilteredCards}
                  collectionMap={collectionMap}
                  binderTags={binderTags}
                  emptyMessage={`No ${TYPE_DISPLAY_NAMES[selectedType] ?? selectedType} cards in this set.`}
                />
              )}
            </>
          )}
        </>
      )}

      {!selectedType && !typeSearch && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <span className="text-5xl mb-3">🎨</span>
          <p className="text-sm">Select a type above to browse cards</p>
        </div>
      )}
    </div>
  );
}
