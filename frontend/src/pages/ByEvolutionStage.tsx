import { useState } from 'react';
import { Loader } from 'lucide-react';
import { useCollectionMap } from '../hooks/useCollection';
import { useSetCards, useSets, useCardSearch } from '../hooks/useCards';
import { CardGrid } from '../components/CardGrid';
import { SearchBar } from '../components/SearchBar';
import { ProgressBar } from '../components/ProgressBar';
import { EVOLUTION_STAGES } from '../utils/constants';

const STAGE_COLORS: Record<string, string> = {
  'Basic':       '#78C850',
  'Stage 1':     '#6890F0',
  'Stage 2':     '#F08030',
  'V':           '#9B59B6',
  'VMAX':        '#8E44AD',
  'VSTAR':       '#F39C12',
  'GX':          '#E74C3C',
  'EX':          '#C0392B',
  'Mega':        '#16A085',
  'BREAK':       '#E67E22',
  'LEGEND':      '#F1C40F',
  'Prism Star':  '#3498DB',
  'Restored':    '#95A5A6',
};

function cardMatchesStage(subtypes: string[] | undefined, stage: string): boolean {
  return !!subtypes?.some((s) => s === stage || s.includes(stage));
}

export function ByEvolutionStage() {
  const [selectedStage, setSelectedStage] = useState<string>('Basic');
  const [stageSearch, setStageSearch] = useState('');   // layer 1: filter stage pills
  const [cardSearch, setCardSearch] = useState('');     // layer 2: search cards
  const [browseSetId, setBrowseSetId] = useState('');
  const [filter, setFilter] = useState<'all' | 'owned' | 'missing'>('all');

  const { data: setsData } = useSets();
  const { data: setCardsData, isLoading: cardsLoading } = useSetCards(browseSetId || null);
  const collectionMap = useCollectionMap();

  // Cross-set search: fires when stage + card name typed
  const crossQuery = selectedStage && cardSearch.length >= 2
    ? `subtypes:${selectedStage.replace(' ', '+')} name:${cardSearch}`
    : '';
  const { data: crossResults, isFetching: crossLoading } = useCardSearch(crossQuery, !!crossQuery);

  const sets = setsData?.data ?? [];
  const allCards = setCardsData?.data ?? [];
  const color = STAGE_COLORS[selectedStage] ?? '#3B4CCA';

  const visibleStages = EVOLUTION_STAGES.filter((s) =>
    !stageSearch || s.toLowerCase().includes(stageSearch.toLowerCase())
  );

  const setStageCards = allCards.filter((c) => {
    const matchStage = cardMatchesStage(c.subtypes, selectedStage);
    const matchSearch = !cardSearch || c.name.toLowerCase().includes(cardSearch.toLowerCase());
    const owned = collectionMap.has(c.id);
    const matchFilter = filter === 'all' || (filter === 'owned' && owned) || (filter === 'missing' && !owned);
    return matchStage && matchSearch && matchFilter;
  });

  const ownedCount = allCards.filter((c) => cardMatchesStage(c.subtypes, selectedStage) && collectionMap.has(c.id)).length;
  const totalCount = allCards.filter((c) => cardMatchesStage(c.subtypes, selectedStage)).length;

  const crossCards = (crossResults?.data ?? []).filter((c) => {
    const owned = collectionMap.has(c.id);
    return filter === 'all' || (filter === 'owned' && owned) || (filter === 'missing' && !owned);
  });

  const binderTags = Array.from(new Set(
    Array.from(collectionMap.values()).map((e) => e.binder_tag).filter(Boolean) as string[]
  ));

  const showCrossSearch = !!crossQuery;
  const showSetBrowse = selectedStage && !cardSearch;

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-gray-900">By Evolution Stage</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {selectedStage
            ? `Showing ${selectedStage} cards — search by name or pick a set`
            : 'Select an evolution stage to explore cards'}
        </p>
      </div>

      {/* Layer 1: Stage selector with filter search */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Evolution Stage</p>
          <div className="flex-1 max-w-48">
            <SearchBar
              value={stageSearch}
              onChange={setStageSearch}
              placeholder="Filter stages…"
              debounceMs={0}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {visibleStages.map((stage) => {
            const stageColor = STAGE_COLORS[stage] ?? '#999';
            const isSelected = selectedStage === stage;
            return (
              <button
                key={stage}
                onClick={() => { setSelectedStage(stage); setCardSearch(''); setBrowseSetId(''); }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                  isSelected ? 'text-white shadow-md scale-105' : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
                }`}
                style={isSelected ? { backgroundColor: stageColor } : {}}
              >
                {stage}
              </button>
            );
          })}
          {visibleStages.length === 0 && (
            <p className="text-sm text-gray-400">No stages match "{stageSearch}"</p>
          )}
        </div>
      </div>

      {/* Layer 2: Card name search + owned filter */}
      {selectedStage && (
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex-1 min-w-48">
            <SearchBar
              value={cardSearch}
              onChange={setCardSearch}
              placeholder={`Search ${selectedStage} cards by name across all sets…`}
            />
          </div>
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
      )}

      {/* Cross-set search results */}
      {showCrossSearch && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {selectedStage} cards named "{cardSearch}" — all sets
          </p>
          {crossLoading ? (
            <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
              <Loader size={18} className="animate-spin" /> Searching all sets…
            </div>
          ) : (
            <CardGrid
              cards={crossCards}
              collectionMap={collectionMap}
              binderTags={binderTags}
              emptyMessage={`No ${selectedStage} cards named "${cardSearch}" found.`}
            />
          )}
        </div>
      )}

      {/* Set picker */}
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
            <option value="">— Pick a set to browse —</option>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.series})</option>
            ))}
          </select>
        </div>
      )}

      {/* Set progress + card grid */}
      {showSetBrowse && browseSetId && (
        <>
          {totalCount > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
              <ProgressBar value={ownedCount} max={totalCount} color={color} label={`${selectedStage} cards in selected set`} />
            </div>
          )}
          {cardsLoading ? (
            <div className="flex items-center gap-2 text-gray-500 justify-center py-12">
              <Loader size={20} className="animate-spin" /> Loading cards…
            </div>
          ) : (
            <CardGrid
              cards={setStageCards}
              collectionMap={collectionMap}
              binderTags={binderTags}
              emptyMessage={`No ${selectedStage} cards found in this set.`}
            />
          )}
        </>
      )}

      {!selectedStage && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <span className="text-5xl mb-3">🔄</span>
          <p className="text-sm">Select a stage above to browse cards</p>
        </div>
      )}
    </div>
  );
}
