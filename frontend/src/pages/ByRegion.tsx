import { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Loader } from 'lucide-react';
import { useQueries } from '@tanstack/react-query';
import { useSets, useSetCards, useCardSearch } from '../hooks/useCards';
import { useCollectionMap } from '../hooks/useCollection';
import { ProgressBar } from '../components/ProgressBar';
import { CardGrid } from '../components/CardGrid';
import { SearchBar } from '../components/SearchBar';
import { REGIONS, SERIES_TO_REGION, POKEMON_TYPES, TYPE_DISPLAY_NAMES } from '../utils/constants';
import { cardsApi } from '../utils/api';
import type { TCGSet, TCGCard } from '../types';

export function ByRegion() {
  const { regionId } = useParams<{ regionId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // layer 1 — region list
  const [regionSearch, setRegionSearch] = useState('');

  // layer 2 — set list
  const [selectedSet, setSelectedSet] = useState<TCGSet | null>(null);
  const [setSearch, setSetSearch] = useState('');

  // layer 2.5 — see all cards in region (default when a region is selected)
  const [showAll, setShowAll] = useState(!!regionId);
  const [allCardSearch, setAllCardSearch] = useState('');
  const [allFilter, setAllFilter] = useState<'all' | 'owned' | 'missing'>('all');
  const [allTypeFilter, setAllTypeFilter] = useState<string>('');
  const [allSetFilter, setAllSetFilter] = useState<string>('');

  // honour ?all=1 from Dashboard link
  useEffect(() => {
    if (searchParams.get('all') === '1') setShowAll(true);
  }, [searchParams]);

  // layer 3 — card grid
  const [cardSearch, setCardSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'owned' | 'missing'>('all');

  const { data: setsData, isLoading: setsLoading } = useSets();
  const { data: setCardsData, isLoading: cardsLoading } = useSetCards(selectedSet?.id ?? null);

  // Cross-set search within a region — fires when setSearch has text and no set is selected
  const crossSetQuery = regionId && !selectedSet && setSearch.length >= 2 ? `name:${setSearch}` : '';
  const { data: crossSetResults, isFetching: crossSetLoading } = useCardSearch(crossSetQuery, !!crossSetQuery);

  const collectionMap = useCollectionMap();
  const binderTags = Array.from(new Set(
    Array.from(collectionMap.values()).map((e) => e.binder_tag).filter(Boolean) as string[]
  ));

  const sets = setsData?.data ?? [];
  const region = REGIONS.find((r) => r.id === regionId);

  const regionSets = regionId ? sets.filter((s) => SERIES_TO_REGION[s.series] === regionId) : [];

  // Layer 3 filter
  const allCards = setCardsData?.data ?? [];
  const filteredCards = allCards.filter((c) => {
    const matchSearch = !cardSearch || c.name.toLowerCase().includes(cardSearch.toLowerCase()) || c.number.includes(cardSearch);
    const owned = collectionMap.has(c.id);
    const matchFilter = filter === 'all' || (filter === 'owned' && owned) || (filter === 'missing' && !owned);
    return matchSearch && matchFilter;
  });

  const ownedInSet = allCards.filter((c) => collectionMap.has(c.id)).length;

  // Cross-set search results filtered to this region
  const crossSetCards = (crossSetResults?.data ?? []).filter(
    (c) => regionId && SERIES_TO_REGION[c.set.series] === regionId
  );

  // See All — load every set in the region
  const allRegionSetIds = regionId ? regionSets.map((s) => s.id) : [];
  const allRegionQueries = useQueries({
    queries: allRegionSetIds.map((setId) => ({
      queryKey: ['set-cards', setId],
      queryFn: () => cardsApi.getSetCards(setId),
      staleTime: 60 * 60_000,
      enabled: showAll && !!regionId,
    })),
  });
  const allRegionLoading = allRegionQueries.some((q) => q.isLoading);
  const allRegionCards = useMemo(() => {
    const cards: TCGCard[] = [];
    allRegionQueries.forEach((q) => q.data?.data?.forEach((c: TCGCard) => cards.push(c)));
    return cards;
  }, [allRegionQueries]);
  const filteredAllCards = useMemo(() => {
    return allRegionCards.filter((c) => {
      const matchSearch = !allCardSearch || c.name.toLowerCase().includes(allCardSearch.toLowerCase()) || c.number.includes(allCardSearch);
      const owned = collectionMap.has(c.id);
      const matchFilter = allFilter === 'all' || (allFilter === 'owned' && owned) || (allFilter === 'missing' && !owned);
      const matchType = !allTypeFilter || c.types?.includes(allTypeFilter);
      const matchSet = !allSetFilter || c.set.id === allSetFilter;
      return matchSearch && matchFilter && matchType && matchSet;
    });
  }, [allRegionCards, allCardSearch, allFilter, allTypeFilter, allSetFilter, collectionMap]);

  // ── Layer 1: Region selector ──────────────────────────────────────────────
  if (!regionId) {
    const visibleRegions = REGIONS.filter((r) =>
      !regionSearch || r.name.toLowerCase().includes(regionSearch.toLowerCase())
    );

    return (
      <div className="space-y-4 animate-fade-in">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Browse by Region</h1>
          <p className="text-sm text-gray-500 mt-0.5">Select a region to explore its sets and cards</p>
        </div>

        <SearchBar value={regionSearch} onChange={setRegionSearch} placeholder="Filter regions…" />

        {setsLoading ? (
          <div className="flex items-center gap-2 text-gray-500"><Loader size={16} className="animate-spin" /> Loading…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visibleRegions.map((r) => {
              const rSets = sets.filter((s) => SERIES_TO_REGION[s.series] === r.id);
              const total = rSets.reduce((acc, s) => acc + s.printedTotal, 0);
              const owned = Array.from(collectionMap.keys()).filter((id) =>
                rSets.some((s) => id.startsWith(s.id + '-'))
              ).length;
              return (
                <Link
                  key={r.id}
                  to={`/region/${r.id}`}
                  className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-all hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl">{r.emoji}</span>
                    <div>
                      <h2 className="font-black text-gray-800">{r.name}</h2>
                      <p className="text-xs text-gray-400">Generation {r.generation} · {rSets.length} sets</p>
                    </div>
                  </div>
                  <ProgressBar value={owned} max={total} color={r.color} height="sm" />
                </Link>
              );
            })}
            {visibleRegions.length === 0 && (
              <p className="text-sm text-gray-400 col-span-full py-8 text-center">No regions match "{regionSearch}"</p>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Layer 2.5: All cards in region (default view when region is selected) ─
  if (regionId && showAll) {
    const ownedTotal = allRegionCards.filter((c) => collectionMap.has(c.id)).length;
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => navigate('/region')}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-gray-900">{region?.emoji} All {region?.name} Cards</h1>
            <p className="text-xs text-gray-400">{allRegionCards.length} total · {ownedTotal} owned</p>
          </div>
          <button
            onClick={() => { setShowAll(false); setAllCardSearch(''); setAllTypeFilter(''); setAllSetFilter(''); setAllFilter('all'); }}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Browse Sets
          </button>
        </div>

        {!allRegionLoading && allRegionCards.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <ProgressBar value={ownedTotal} max={allRegionCards.length} color={region?.color ?? '#3B4CCA'} label={`${region?.name} completion`} />
          </div>
        )}

        {/* Search + owned filter row */}
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-48">
            <SearchBar value={allCardSearch} onChange={setAllCardSearch} placeholder="Search by name or number…" />
          </div>
          <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm shrink-0">
            {(['all', 'owned', 'missing'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setAllFilter(f)}
                className={`px-3 py-2 text-xs font-semibold capitalize transition-colors ${allFilter === f ? 'bg-pokemon-blue text-white' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Type + set filter row */}
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex flex-wrap gap-1.5 flex-1">
            <button
              onClick={() => setAllTypeFilter('')}
              className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${!allTypeFilter ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
            >
              All Types
            </button>
            {POKEMON_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setAllTypeFilter(allTypeFilter === t ? '' : t)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${allTypeFilter === t ? 'ring-2 ring-offset-1 opacity-100' : 'opacity-70 hover:opacity-100'}`}
                style={{
                  backgroundColor: allTypeFilter === t ? '#3B4CCA' : '#e5e7eb',
                  color: allTypeFilter === t ? '#fff' : '#555',
                }}
              >
                {TYPE_DISPLAY_NAMES[t] ?? t}
              </button>
            ))}
          </div>
          <select
            value={allSetFilter}
            onChange={(e) => setAllSetFilter(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-pokemon-blue/30 shrink-0"
          >
            <option value="">All Sets</option>
            {regionSets.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {allRegionLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader size={20} className="animate-spin mr-2" /> Loading all {region?.name} cards…
          </div>
        ) : (
          <CardGrid
            cards={filteredAllCards}
            collectionMap={collectionMap}
            binderTags={binderTags}
            emptyMessage="No cards match your filter."
          />
        )}
      </div>
    );
  }

  // ── Layer 2: Set list + cross-set search ──────────────────────────────────
  if (!selectedSet) {
    const filteredSets = regionSets.filter((s) =>
      !setSearch || s.name.toLowerCase().includes(setSearch.toLowerCase())
    );

    const showCrossSearch = setSearch.length >= 2;

    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => navigate('/region')} className="text-gray-400 hover:text-gray-600 transition-colors">
            <ChevronLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-black text-gray-900">{region?.emoji} {region?.name}</h1>
            <p className="text-sm text-gray-500">{regionSets.length} sets</p>
          </div>
          <button
            onClick={() => setShowAll(true)}
            className="text-sm font-semibold px-4 py-2 rounded-xl transition-colors text-white"
            style={{ backgroundColor: region?.color ?? '#3B4CCA' }}
          >
            ← All Cards
          </button>
        </div>

        <SearchBar
          value={setSearch}
          onChange={setSetSearch}
          placeholder={`Search sets or cards in ${region?.name}…`}
        />

        {/* Cross-set card search results */}
        {showCrossSearch ? (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Cards matching "{setSearch}" in {region?.name}
            </p>
            {crossSetLoading ? (
              <div className="flex items-center gap-2 text-gray-500 py-8 justify-center">
                <Loader size={18} className="animate-spin" /> Searching…
              </div>
            ) : (
              <>
                <CardGrid
                  cards={crossSetCards}
                  collectionMap={collectionMap}
                  binderTags={binderTags}
                  emptyMessage={`No cards named "${setSearch}" found in ${region?.name}.`}
                />
                {crossSetCards.length > 0 && filteredSets.length > 0 && (
                  <p className="text-xs text-gray-400 mt-4 mb-2 font-semibold uppercase tracking-wide">
                    Sets also matching "{setSearch}"
                  </p>
                )}
              </>
            )}
            {/* Also show matching set names below card results */}
            {filteredSets.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                {filteredSets.map((set) => (
                  <SetCard key={set.id} set={set} region={region} onClick={() => setSelectedSet(set)} collectionMap={collectionMap} />
                ))}
              </div>
            )}
          </div>
        ) : (
          setsLoading ? (
            <div className="flex items-center gap-2 text-gray-500"><Loader size={16} className="animate-spin" /> Loading sets…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredSets.map((set) => (
                <SetCard key={set.id} set={set} region={region} onClick={() => setSelectedSet(set)} collectionMap={collectionMap} />
              ))}
              {filteredSets.length === 0 && (
                <p className="text-sm text-gray-400 col-span-full py-8 text-center">No sets match "{setSearch}"</p>
              )}
            </div>
          )
        )}
      </div>
    );
  }

  // ── Layer 3: Card grid within a set ──────────────────────────────────────
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => { setSelectedSet(null); setCardSearch(''); }} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ChevronLeft size={20} />
        </button>
        <img src={selectedSet.images.logo} alt={selectedSet.name} className="h-8 object-contain" />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black text-gray-900 truncate">{selectedSet.name}</h1>
          <p className="text-xs text-gray-400">{selectedSet.printedTotal} cards · {selectedSet.releaseDate}</p>
        </div>
      </div>

      {!cardsLoading && allCards.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <ProgressBar value={ownedInSet} max={allCards.length} color={region?.color ?? '#3B4CCA'} label={`${selectedSet.name} completion`} />
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-48">
          <SearchBar value={cardSearch} onChange={setCardSearch} placeholder="Search by name or number…" />
        </div>
        <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm">
          {(['all', 'owned', 'missing'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 text-xs font-semibold capitalize transition-colors ${filter === f ? 'bg-pokemon-blue text-white' : 'text-gray-500 hover:bg-gray-50'}`}
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
        <CardGrid cards={filteredCards} collectionMap={collectionMap} binderTags={binderTags} emptyMessage="No cards match your filter." />
      )}
    </div>
  );
}

// Small helper so JSX stays clean above
function SetCard({ set, region, onClick, collectionMap }: {
  set: TCGSet;
  region: ReturnType<typeof REGIONS.find>;
  onClick: () => void;
  collectionMap: Map<string, any>;
}) {
  const owned = Array.from(collectionMap.keys()).filter((id) => id.startsWith(set.id + '-')).length;
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-0.5 transition-all text-left w-full"
    >
      <div className="flex items-center gap-3 mb-3">
        <img src={set.images.symbol} alt="" className="w-8 h-8 object-contain" />
        <div className="min-w-0">
          <p className="font-bold text-gray-800 text-sm truncate">{set.name}</p>
          <p className="text-xs text-gray-400">{set.releaseDate} · {set.printedTotal} cards</p>
        </div>
      </div>
      <ProgressBar value={owned} max={set.printedTotal} color={region?.color ?? '#3B4CCA'} height="sm" />
    </button>
  );
}
