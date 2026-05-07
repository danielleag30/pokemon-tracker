import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Upload, RefreshCw, Loader } from 'lucide-react';
import { useCollection, useCollectionStats, useCollectionMap } from '../hooks/useCollection';
import { useSets } from '../hooks/useCards';
import { useCardSearch } from '../hooks/useCards';
import { ProgressBar } from '../components/ProgressBar';
import { CardGrid } from '../components/CardGrid';
import { SearchBar } from '../components/SearchBar';
import { REGIONS, SERIES_TO_REGION } from '../utils/constants';
import { collectionApi } from '../utils/api';

export function Dashboard() {
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);

  const { data: stats, isLoading: statsLoading } = useCollectionStats();
  const { data: setsData } = useSets();
  const collectionMap = useCollectionMap();
  const { data: collection } = useCollection();

  const { data: searchResults, isFetching: searching } = useCardSearch(search, search.length >= 2);

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

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const coll = json.collection ?? json;
      await collectionApi.importCollection(coll, true);
      window.location.reload();
    } catch (err) {
      alert('Failed to import: invalid file format');
    } finally {
      setImporting(false);
    }
  };

  const statCards = [
    { label: 'Unique Cards', value: stats?.uniqueCards ?? 0, color: '#3B4CCA', emoji: '🃏' },
    { label: 'Total Copies', value: stats?.totalCards ?? 0, color: '#22c55e', emoji: '📦' },
    { label: 'Duplicates',   value: stats?.duplicates  ?? 0, color: '#f59e0b', emoji: '🔁' },
    { label: 'Binders',      value: stats?.binders.length ?? 0, color: '#8b5cf6', emoji: '📚' },
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
          <label className={`flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-2 rounded-xl transition-colors cursor-pointer ${importing ? 'opacity-50' : ''}`}>
            {importing ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />} Import
            <input type="file" accept=".json" className="hidden" onChange={handleImport} />
          </label>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(({ label, value, color, emoji }) => (
          <div key={label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="text-2xl mb-1">{emoji}</div>
            {statsLoading ? (
              <div className="h-8 bg-gray-100 rounded animate-pulse w-16 mb-1" />
            ) : (
              <p className="text-2xl font-black" style={{ color }}>{value.toLocaleString()}</p>
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
          <h2 className="text-sm font-bold text-gray-700">Progress by Region</h2>
          <Link to="/region" className="text-xs text-pokemon-blue hover:underline font-medium">
            View all →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {regionProgress.map((r) => (
            <Link key={r.id} to={`/region/${r.id}`} className="block hover:bg-gray-50 rounded-xl p-2 -m-2 transition-colors">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base">{r.emoji}</span>
                <span className="text-sm font-semibold text-gray-700">{r.name}</span>
                <span className="text-xs text-gray-400 ml-auto">Gen {r.generation}</span>
              </div>
              <ProgressBar value={r.owned} max={r.total} color={r.color} height="sm" />
            </Link>
          ))}
        </div>
      </div>

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
