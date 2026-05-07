import { useState, useEffect } from 'react';
import { X, Search, Loader, Plus, Minus, CheckCircle } from 'lucide-react';
import { useCardSearch } from '../hooks/useCards';
import { useAddCard } from '../hooks/useCollection';
import type { TCGCard } from '../types';

interface Props {
  onClose: () => void;
}

export function SearchAddModal({ onClose }: Props) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCard, setSelectedCard] = useState<TCGCard | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [binderTag, setBinderTag] = useState('');
  const [added, setAdded] = useState(false);
  const addCard = useAddCard();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 400);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading } = useCardSearch(
    `name:${debouncedQuery}*`,
    debouncedQuery.length >= 2,
  );
  const results: TCGCard[] = data?.data ?? [];

  const handleSelect = (card: TCGCard) => {
    setSelectedCard(card);
    setQuantity(1);
    setBinderTag('');
    setAdded(false);
  };

  const handleAdd = async () => {
    if (!selectedCard) return;
    await addCard.mutateAsync({ cardId: selectedCard.id, quantity, binderTag: binderTag || undefined });
    setAdded(true);
    setTimeout(() => {
      setAdded(false);
      setSelectedCard(null);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-fade-in">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Search & Add Card</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cards… (e.g. Charizard, Pikachu)"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pokemon-blue/30"
            />
          </div>
        </div>

        {selectedCard ? (
          <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
            <img
              src={selectedCard.images.large}
              alt={selectedCard.name}
              className="w-40 rounded-xl shadow-lg mb-4"
            />
            <h3 className="text-xl font-bold text-gray-800">{selectedCard.name}</h3>
            <p className="text-sm text-gray-500 mb-6">
              {selectedCard.set.name} · #{selectedCard.number}
            </p>

            <div className="w-full max-w-xs space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Quantity</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="text-xl font-bold w-8 text-center">{quantity}</span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1 block">Binder Tag (optional)</label>
                <input
                  type="text"
                  value={binderTag}
                  onChange={(e) => setBinderTag(e.target.value)}
                  placeholder="e.g. Binder 1, Kanto binder…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pokemon-blue/30"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading && (
              <div className="flex items-center justify-center py-12 text-gray-500">
                <Loader size={20} className="animate-spin mr-2" /> Searching…
              </div>
            )}
            {!isLoading && debouncedQuery.length < 2 && (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Search size={32} className="mb-2 opacity-40" />
                <p className="text-sm">Type a card name to search</p>
              </div>
            )}
            {!isLoading && debouncedQuery.length >= 2 && results.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <p className="text-sm">No cards found for "{debouncedQuery}"</p>
              </div>
            )}
            {results.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {results.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => handleSelect(card)}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-gray-50 hover:bg-pokemon-blue/10 hover:ring-2 hover:ring-pokemon-blue transition-all text-left"
                  >
                    <img src={card.images.small} alt={card.name} className="w-full rounded-lg shadow-sm" />
                    <div className="w-full">
                      <p className="text-xs font-semibold text-gray-800 truncate">{card.name}</p>
                      <p className="text-xs text-gray-500 truncate">{card.set.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="p-4 border-t flex items-center justify-between">
          {selectedCard ? (
            <>
              <button
                onClick={() => setSelectedCard(null)}
                className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
              >
                ← Back to results
              </button>
              <button
                onClick={handleAdd}
                disabled={addCard.isPending || added}
                className="px-5 py-2 bg-pokemon-blue text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {added ? (
                  <><CheckCircle size={14} /> Added!</>
                ) : addCard.isPending ? (
                  <><Loader size={14} className="animate-spin" /> Adding…</>
                ) : (
                  'Add to Collection'
                )}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="ml-auto px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
