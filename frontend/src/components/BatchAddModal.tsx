import { useState } from 'react';
import { X, Search, CheckSquare, Square, Loader } from 'lucide-react';
import { useSets, useSetCards } from '../hooks/useCards';
import { useCollectionMap, useBatchAddCards, useCollectionStats } from '../hooks/useCollection';
import { getAvailableTiers, getDefaultTier } from '../utils/prices';
import { FOIL_LABELS, type FoilType } from '../types';
import { ProgressBar } from './ProgressBar';
import type { TCGCard } from '../types';

interface Props {
  onClose: () => void;
}

export function BatchAddModal({ onClose }: Props) {
  const [selectedSet, setSelectedSet] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Map<string, FoilType | null>>(new Map());
  const [binderTag, setBinderTag] = useState('');

  const { data: setsData, isLoading: setsLoading } = useSets();
  const { data: setCardsData, isLoading: cardsLoading } = useSetCards(selectedSet || null);
  const collectionMap = useCollectionMap();
  const batchAdd = useBatchAddCards();
  const { data: stats } = useCollectionStats();
  const existingBinders = stats?.binders.map((b) => b.binder_tag) ?? [];

  const sets = setsData?.data ?? [];
  const allCards: TCGCard[] = setCardsData?.data ?? [];

  const filtered = allCards.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.number.includes(search)
  );

  const pokemonCards = filtered.filter((c) => c.supertype === 'Pokémon');
  const ownedInSet = allCards.filter((c) => collectionMap.has(c.id)).length;

  const toggle = (card: TCGCard) => {
    setSelected((prev) => {
      const next = new Map(prev);
      next.has(card.id) ? next.delete(card.id) : next.set(card.id, getDefaultTier(card));
      return next;
    });
  };

  const setTier = (cardId: string, tier: FoilType) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(cardId)) next.set(cardId, tier);
      return next;
    });
  };

  const selectAll = () => setSelected(new Map(pokemonCards.map((c) => [c.id, getDefaultTier(c)])));
  const selectMissing = () =>
    setSelected(new Map(pokemonCards.filter((c) => !collectionMap.has(c.id)).map((c) => [c.id, getDefaultTier(c)])));
  const clearAll = () => setSelected(new Map());

  const handleAdd = async () => {
    if (selected.size === 0) return;
    const cards = Array.from(selected.entries()).map(([cardId, foilType]) => ({
      cardId,
      quantity: 1,
      binderTag: binderTag || undefined,
      foilType: foilType ?? undefined,
    }));
    await batchAdd.mutateAsync(cards);
    setSelected(new Map());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Batch Add Cards</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Select Set</label>
              {setsLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500"><Loader size={14} className="animate-spin" /> Loading sets…</div>
              ) : (
                <select
                  value={selectedSet}
                  onChange={(e) => { setSelectedSet(e.target.value); setSelected(new Map()); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pokemon-blue/30"
                >
                  <option value="">— Choose a set —</option>
                  {sets.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.series})</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Binder Tag (optional)</label>
              <input
                type="text"
                value={binderTag}
                onChange={(e) => setBinderTag(e.target.value)}
                placeholder="e.g. Binder 1, Kanto binder…"
                list="batch-binder-suggestions"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pokemon-blue/30"
              />
              <datalist id="batch-binder-suggestions">
                {existingBinders.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>
          </div>

          {selectedSet && allCards.length > 0 && (
            <div className="flex items-center justify-between">
              <ProgressBar value={ownedInSet} max={allCards.length} color="#22c55e" showPercent />
              <div className="flex gap-2 ml-4 shrink-0">
                <button onClick={selectMissing} className="text-xs bg-orange-100 text-orange-700 hover:bg-orange-200 px-2 py-1 rounded-lg transition-colors font-medium">
                  Select Missing
                </button>
                <button onClick={selectAll} className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 px-2 py-1 rounded-lg transition-colors font-medium">
                  Select All
                </button>
                <button onClick={clearAll} className="text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 px-2 py-1 rounded-lg transition-colors font-medium">
                  Clear
                </button>
              </div>
            </div>
          )}

          {selectedSet && (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter cards…"
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-pokemon-blue/30"
              />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {cardsLoading && (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader size={20} className="animate-spin mr-2" /> Loading cards…
            </div>
          )}

          {!cardsLoading && selectedSet && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {filtered.map((card) => {
                const isOwned = collectionMap.has(card.id);
                const isSelected = selected.has(card.id);
                const tiers = getAvailableTiers(card);
                const currentTier = selected.get(card.id) ?? null;
                return (
                  <div
                    key={card.id}
                    className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${
                      isSelected
                        ? 'bg-pokemon-blue/10 ring-2 ring-pokemon-blue'
                        : isOwned
                        ? 'bg-green-50 ring-1 ring-green-200'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <button
                      onClick={() => toggle(card)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      {isSelected ? (
                        <CheckSquare size={16} className="text-pokemon-blue shrink-0" />
                      ) : (
                        <Square size={16} className="text-gray-300 shrink-0" />
                      )}
                      <img
                        src={card.images.small}
                        alt={card.name}
                        className="w-8 h-11 object-contain rounded shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{card.name}</p>
                        <p className="text-xs text-gray-500">#{card.number} · {card.rarity ?? '—'}</p>
                      </div>
                    </button>
                    {isOwned && !isSelected && (
                      <span className="shrink-0 text-xs bg-green-100 text-green-700 font-semibold px-1.5 py-0.5 rounded-full">
                        ✓ {collectionMap.get(card.id)!.quantity}
                      </span>
                    )}
                    {isSelected && tiers.length > 1 && (
                      <select
                        value={currentTier ?? ''}
                        onChange={(e) => setTier(card.id, e.target.value as FoilType)}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 text-xs border border-pokemon-blue/30 rounded-lg px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-pokemon-blue max-w-[110px]"
                      >
                        {tiers.map((t) => (
                          <option key={t} value={t}>{FOIL_LABELS[t]}</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!selectedSet && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <span className="text-4xl mb-2">📦</span>
              <p className="text-sm">Select a set above to browse cards</p>
            </div>
          )}
        </div>

        <div className="p-4 border-t flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {selected.size > 0 ? `${selected.size} card${selected.size !== 1 ? 's' : ''} selected` : 'No cards selected'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={selected.size === 0 || batchAdd.isPending}
              className="px-5 py-2 bg-pokemon-blue text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {batchAdd.isPending && <Loader size={14} className="animate-spin" />}
              Add {selected.size > 0 ? selected.size : ''} Cards
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
