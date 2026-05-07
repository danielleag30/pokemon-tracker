import { useState, useEffect } from 'react';
import { Loader, Minus, Plus, Trash2 } from 'lucide-react';
import { useCollection, useUpdateCard, useRemoveCard } from '../hooks/useCollection';
import { cardsApi } from '../utils/api';
import { TypeBadge } from '../components/TypeBadge';
import { SearchBar } from '../components/SearchBar';
import type { TCGCard } from '../types';

export function Duplicates() {
  const [search, setSearch] = useState('');
  const [cardDetails, setCardDetails] = useState<Map<string, TCGCard>>(new Map());
  const [loading, setLoading] = useState(false);

  const { data: collection } = useCollection();
  const updateCard = useUpdateCard();
  const removeCard = useRemoveCard();

  const dupes = (collection ?? []).filter((e) => e.quantity > 1);

  useEffect(() => {
    if (dupes.length === 0) return;
    const unknown = dupes.filter((e) => !cardDetails.has(e.card_id)).map((e) => e.card_id);
    if (unknown.length === 0) return;

    setLoading(true);
    Promise.allSettled(unknown.slice(0, 50).map((id) => cardsApi.getCard(id)))
      .then((results) => {
        setCardDetails((prev) => {
          const next = new Map(prev);
          results.forEach((r) => {
            if (r.status === 'fulfilled') {
              const card = r.value?.data as TCGCard;
              if (card) next.set(card.id, card);
            }
          });
          return next;
        });
      })
      .finally(() => setLoading(false));
  }, [dupes.length]);

  const filtered = dupes.filter((e) => {
    if (!search) return true;
    const detail = cardDetails.get(e.card_id);
    return (
      (detail?.name ?? e.card_id).toLowerCase().includes(search.toLowerCase()) ||
      e.card_id.toLowerCase().includes(search.toLowerCase()) ||
      (e.binder_tag ?? '').toLowerCase().includes(search.toLowerCase())
    );
  });

  const totalDupes = dupes.reduce((acc, e) => acc + (e.quantity - 1), 0);

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-gray-900">Duplicates</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {dupes.length} cards with multiples · {totalDupes} extra cop{totalDupes !== 1 ? 'ies' : 'y'} to trade
        </p>
      </div>

      {dupes.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <p className="text-2xl font-black text-amber-500">{dupes.length}</p>
            <p className="text-xs text-gray-500 font-medium">Duplicate Cards</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <p className="text-2xl font-black text-orange-500">{totalDupes}</p>
            <p className="text-xs text-gray-500 font-medium">Extra Copies</p>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <p className="text-2xl font-black text-green-500">
              {dupes.reduce((max, e) => Math.max(max, e.quantity), 0)}x
            </p>
            <p className="text-xs text-gray-500 font-medium">Most of One Card</p>
          </div>
        </div>
      )}

      <SearchBar value={search} onChange={setSearch} placeholder="Search duplicates…" />

      {loading && (
        <div className="flex items-center gap-2 text-gray-500 py-4">
          <Loader size={16} className="animate-spin" /> Loading card details…
        </div>
      )}

      {dupes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <span className="text-5xl mb-3">✨</span>
          <p className="text-sm font-medium">No duplicates — every card is unique!</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Card</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Binder</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((entry) => {
                const detail = cardDetails.get(entry.card_id);
                const qty = entry.quantity;
                return (
                  <tr key={entry.card_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {detail?.images.small ? (
                          <img
                            src={detail.images.small}
                            alt={detail.name}
                            className="w-8 h-11 object-contain rounded shadow-sm shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-11 bg-gray-100 rounded shrink-0 flex items-center justify-center text-xs">🃏</div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800 truncate">
                            {detail?.name ?? entry.card_id}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            {detail ? `${detail.set.name} #${detail.number}` : entry.card_id}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {detail?.types?.map((t) => <TypeBadge key={t} type={t} size="sm" />) ?? <span className="text-gray-400 text-xs">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-gray-500">{entry.binder_tag ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => updateCard.mutate({ cardId: entry.card_id, updates: { quantity: qty - 1 } })}
                          disabled={updateCard.isPending}
                          className="w-6 h-6 flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-600 rounded transition-colors disabled:opacity-50"
                        >
                          <Minus size={10} />
                        </button>
                        <span className="w-8 text-center font-bold text-gray-800">{qty}</span>
                        <button
                          onClick={() => updateCard.mutate({ cardId: entry.card_id, updates: { quantity: qty + 1 } })}
                          disabled={updateCard.isPending}
                          className="w-6 h-6 flex items-center justify-center bg-green-100 hover:bg-green-200 text-green-600 rounded transition-colors disabled:opacity-50"
                        >
                          <Plus size={10} />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => removeCard.mutate(entry.card_id)}
                        disabled={removeCard.isPending}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Remove from collection"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
