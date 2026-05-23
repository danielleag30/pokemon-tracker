import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Loader } from 'lucide-react';
import { useCollection, useCollectionStats, useCollectionMap, useCollectionValue } from '../hooks/useCollection';
import { useSets } from '../hooks/useCards';
import { useCardSearch } from '../hooks/useCards';
import { ProgressBar } from '../components/ProgressBar';
import { CardGrid } from '../components/CardGrid';
import { SearchBar } from '../components/SearchBar';
import { REGIONS, SERIES_TO_REGION } from '../utils/constants';
import { collectionApi } from '../utils/api';
import { formatPrice } from '../utils/prices';

export function Dashboard() {
  const [search, setSearch] = useState('');
  const { data: stats, isLoading: statsLoading } = useCollectionStats();
  const { data: setsData } = useSets();
  const collectionMap = useCollectionMap();
  const { data: collection } = useCollection();
  const { totalValue, topCards, isLoading: valueLoading } = useCollectionValue();

  const { data: searchResults, isFetching: searching } = useCardSearch(`name:${search}*`, search.length >= 2);

  const sets = setsData?.data ?? [];

  const regionProgress = REGIONS.map((region) => {
    const regionSets = sets.filter((s) => SERIES_TO_REGION[s.series] === region.id);
    const total = regionSets.reduce((acc, s) => acc + s.printedTotal, 0);
    const owned = collection?.filter((e) => {
      const card = e.card_id;
      return regionSets.some((s) => card.startsWith(s.id + '-'));
    }).length ?? 0;
    return { ...region, owned, total };
  }).filter((r) => r.total > 0);

  const handleExport = async () => {
    const data = await collectionApi.exportCollection();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pokemon-collection-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statCards = [
    { label: 'Number of Unique Cards',   value: stats?.uniqueCards ?? 0,      color: '#3B4CCA', emoji: '🃏', format: (v: number) => v.toLocaleString() },
    { label: 'Total Amount of Cards',   value: stats?.totalCards ?? 0,       color: '#22c55e', emoji: '📦', format: (v: number) => v.toLocaleString() },
    { label: 'Est. Value',     value: totalValue,                    color: '#f59e0b', emoji: '💰', format: (v: number) => valueLoading ? '…' : formatPrice(v) },
    { label: 'Binders',        value: stats?.binders.length ?? 0,   color: '#8b5cf6', emoji: '📚', format: (v: number) => v.toLocaleString() },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">My Collection</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track your Pokémon TCG cards across all devices</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-2 rounded-xl transition-colors"
          >
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(({ label, value, color, emoji, format }) => (
          <div key={label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="text-2xl mb-1">{emoji}</div>
            {statsLoading && label !== 'Est. Value' ? (
              <div className="h-8 bg-gray-100 rounded animate-pulse w-16 mb-1" />
            ) : (
              <p className="text-2xl font-black" style={{ color }}>{format(value)}</p>
            )}
            <p className="text-xs text-gray-500 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <h2 className="text-sm font-bold text-gray-700 mb-3">Quick Search & Add</h2>
        <SearchBar value={search} onChange={setSearch} placeholder="Search any Pokémon card…" />
        {search.length >= 2 && (
          <div className="mt-4">
            {searching ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                <Loader size={16} className="animate-spin" /> Searching…
              </div>
            ) : (
              <CardGrid
                cards={searchResults?.data ?? []}
                collectionMap={collectionMap}
                emptyMessage="No cards found for that search."
              />
            )}
          </div>
        )}
      </div>

      {/* Region progress */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-700">Progress by Series</h2>
          <Link to="/series" className="text-xs text-pokemon-blue hover:underline font-medium">
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {regionProgress.map((r) => (
            <div key={r.id} className="rounded-xl p-2 -m-2">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base">{r.emoji}</span>
                <Link to="/series" className="text-sm font-semibold text-gray-700 hover:text-pokemon-blue transition-colors">
                  {r.name}
                </Link>
                <span className="text-xs text-gray-400">Gen {r.generation}</span>
                <Link
                  to="/series"
                  className="ml-auto text-xs font-semibold hover:underline transition-colors"
                  style={{ color: r.color }}
                >
                  View Series →
                </Link>
              </div>
              <ProgressBar value={r.owned} max={r.total} color={r.color} height="sm" />
            </div>
          ))}
        </div>
      </div>

      {/* Top valuable cards */}
      {topCards.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-700">💰 Most Valuable Cards</h2>
            <span className="text-xs text-gray-400">TCGPlayer market price</span>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {topCards.map(({ card, entry, price }) => (
              <div key={card.id} className="flex flex-col items-center gap-1">
                <div className="relative w-full">
                  <img src={card.images.small} alt={card.name} className="w-full rounded-lg shadow-sm" />
                  {entry.quantity > 1 && (
                    <span className="absolute top-0.5 right-0.5 bg-pokemon-blue text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {entry.quantity}
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold text-amber-600">{formatPrice(price)}</span>
                <span className="text-xs text-gray-500 truncate w-full text-center">{card.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Binders */}
      {(stats?.binders.length ?? 0) > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h2 className="text-sm font-bold text-gray-700 mb-3">📚 Binders</h2>
          <div className="flex flex-wrap gap-2">
            {stats!.binders.map(({ binder_tag, count }) => (
              <div key={binder_tag} className="flex items-center gap-1.5 bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full text-sm font-medium">
                <span>{binder_tag}</span>
                <span className="bg-purple-200 text-purple-800 text-xs rounded-full px-1.5 font-bold">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
