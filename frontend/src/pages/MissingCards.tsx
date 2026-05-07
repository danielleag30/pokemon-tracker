import { useState } from 'react';
import { Printer, Loader } from 'lucide-react';
import { useCollectionMap } from '../hooks/useCollection';
import { useSetCards, useSets } from '../hooks/useCards';
import { CardGrid } from '../components/CardGrid';
import { SearchBar } from '../components/SearchBar';
import { ProgressBar } from '../components/ProgressBar';
import { TypeBadge } from '../components/TypeBadge';
import type { TCGCard } from '../types';

export function MissingCards() {
  const [selectedSet, setSelectedSet] = useState('');
  const [search, setSearch] = useState('');
  const [supertype, setSupertype] = useState<'all' | 'Pokémon' | 'Trainer' | 'Energy'>('all');
  const [printMode, setPrintMode] = useState(false);

  const { data: setsData } = useSets();
  const { data: setCardsData, isLoading: cardsLoading } = useSetCards(selectedSet || null);
  const collectionMap = useCollectionMap();

  const sets = setsData?.data ?? [];
  const allCards: TCGCard[] = setCardsData?.data ?? [];

  const missing = allCards.filter((c) => {
    const notOwned = !collectionMap.has(c.id);
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.number.includes(search);
    const matchType = supertype === 'all' || c.supertype === supertype;
    return notOwned && matchSearch && matchType;
  });

  const owned = allCards.filter((c) => collectionMap.has(c.id)).length;
  const selectedSetInfo = sets.find((s) => s.id === selectedSet);

  return (
    <div className={`space-y-4 animate-fade-in ${printMode ? 'print:text-black' : ''}`}>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Missing Cards</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cards you still need to complete your sets</p>
        </div>
        <button
          onClick={() => { setPrintMode(!printMode); setTimeout(() => window.print(), 100); }}
          className="flex items-center gap-2 text-sm text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-2 rounded-xl transition-colors"
        >
          <Printer size={14} /> Print Checklist
        </button>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <label className="text-xs font-semibold text-gray-500 mb-2 block uppercase tracking-wide">
          Select a Set
        </label>
        <select
          value={selectedSet}
          onChange={(e) => setSelectedSet(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pokemon-blue/30"
        >
          <option value="">— Choose a set to see what you're missing —</option>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.series})</option>
          ))}
        </select>
      </div>

      {selectedSet && allCards.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <ProgressBar
            value={owned}
            max={allCards.length}
            color="#22c55e"
            label={`${selectedSetInfo?.name ?? ''} completion`}
          />
          <p className="text-sm text-orange-600 font-semibold mt-2">
            {missing.length} card{missing.length !== 1 ? 's' : ''} still needed
          </p>
        </div>
      )}

      {selectedSet && (
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-48">
            <SearchBar value={search} onChange={setSearch} placeholder="Filter missing cards…" />
          </div>
          <div className="flex rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm">
            {(['all', 'Pokémon', 'Trainer', 'Energy'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setSupertype(t)}
                className={`px-3 py-2 text-xs font-semibold transition-colors ${
                  supertype === t ? 'bg-pokemon-blue text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {cardsLoading ? (
        <div className="flex items-center gap-2 text-gray-500 justify-center py-12">
          <Loader size={20} className="animate-spin" /> Loading cards…
        </div>
      ) : selectedSet ? (
        <>
          {/* Print-friendly checklist */}
          {printMode ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 print:block">
              {missing.map((card) => (
                <div key={card.id} className="flex items-center gap-2 p-2 border rounded-lg print:border-gray-300">
                  <div className="w-4 h-4 border-2 border-gray-300 rounded shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{card.name}</p>
                    <p className="text-xs text-gray-500">#{card.number} · {card.rarity}</p>
                  </div>
                  <div className="ml-auto flex gap-1 shrink-0">
                    {card.types?.map((t) => <TypeBadge key={t} type={t} size="sm" />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <CardGrid
              cards={missing}
              collectionMap={collectionMap}
              emptyMessage="You have all cards in this set! 🎉"
            />
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <span className="text-5xl mb-3">🔍</span>
          <p className="text-sm">Select a set to see which cards you need</p>
        </div>
      )}
    </div>
  );
}
