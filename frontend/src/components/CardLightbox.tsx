import { useEffect, useState } from 'react';
import { X, BookOpen, Trash2, Plus, Minus } from 'lucide-react';
import { TypeBadge } from './TypeBadge';
import { getMarketPrice, formatPrice, getAvailableTiers } from '../utils/prices';
import { useUpdateCard, useRemoveCard, useCollectionStats } from '../hooks/useCollection';
import { FOIL_LABELS, type FoilType } from '../types';
import type { TCGCard, CollectionEntry } from '../types';

interface Props {
  card: TCGCard;
  entry?: CollectionEntry;
  onClose: () => void;
}

export function CardLightbox({ card, entry, onClose }: Props) {
  const [binderInput, setBinderInput] = useState(entry?.binder_tag ?? '');
  const [binderSaved, setBinderSaved] = useState(false);
  const [foilSaved, setFoilSaved] = useState(false);

  const updateCard = useUpdateCard();
  const removeCard = useRemoveCard();
  const { data: stats } = useCollectionStats();
  const binderTags = stats?.binders.map((b) => b.binder_tag) ?? [];

  const availableTiers = getAvailableTiers(card);
  const [foilType, setFoilType] = useState<FoilType | null>(entry?.foil_type ?? null);
  const price = getMarketPrice(card, foilType);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleBinderSave = () => {
    if (!entry) return;
    updateCard.mutate(
      { cardId: card.id, updates: { binderTag: binderInput || null } },
      { onSuccess: () => { setBinderSaved(true); setTimeout(() => setBinderSaved(false), 1500); } },
    );
  };

  const handleFoilSave = (tier: FoilType) => {
    if (!entry) return;
    setFoilType(tier);
    updateCard.mutate(
      { cardId: card.id, updates: { foilType: tier } },
      { onSuccess: () => { setFoilSaved(true); setTimeout(() => setFoilSaved(false), 1500); } },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-bold text-gray-800">{card.name}</h2>
            <p className="text-xs text-gray-500">{card.set.name} · #{card.number}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 flex flex-col sm:flex-row gap-4">
          <img
            src={card.images.large}
            alt={card.name}
            className="w-full sm:w-44 rounded-xl shadow-lg object-contain self-start"
          />

          <div className="space-y-2 flex-1">
            {card.types && card.types.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {card.types.map((t) => <TypeBadge key={t} type={t} size="sm" />)}
              </div>
            )}

            {card.subtypes && card.subtypes.length > 0 && (
              <p className="text-xs text-gray-500">{card.subtypes.join(' · ')}</p>
            )}

            <div className="space-y-1 text-sm">
              {card.hp && (
                <div className="flex justify-between">
                  <span className="text-gray-500">HP</span>
                  <span className="font-semibold text-gray-800">{card.hp}</span>
                </div>
              )}
              {card.rarity && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Rarity</span>
                  <span className="font-semibold text-gray-800">{card.rarity}</span>
                </div>
              )}
              {card.artist && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Artist</span>
                  <span className="font-semibold text-gray-800 text-right">{card.artist}</span>
                </div>
              )}
              {price != null && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Market Price</span>
                  <span className="font-bold text-amber-600">{formatPrice(price)}</span>
                </div>
              )}
              {entry && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Owned</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        if (entry.quantity <= 1) return;
                        updateCard.mutate({ cardId: card.id, updates: { quantity: entry.quantity - 1 } });
                      }}
                      disabled={entry.quantity <= 1 || updateCard.isPending}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-600 rounded p-0.5 transition-colors disabled:opacity-30"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="font-bold text-green-600 w-5 text-center">{entry.quantity}</span>
                    <button
                      onClick={() => updateCard.mutate({ cardId: card.id, updates: { quantity: entry.quantity + 1 } })}
                      disabled={updateCard.isPending}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-600 rounded p-0.5 transition-colors disabled:opacity-50"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                </div>
              )}
              {entry && availableTiers.length > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Card Type</span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={foilType ?? ''}
                      onChange={(e) => handleFoilSave(e.target.value as FoilType)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-pokemon-blue bg-white"
                    >
                      {availableTiers.map((t) => (
                        <option key={t} value={t}>{FOIL_LABELS[t]}</option>
                      ))}
                    </select>
                    {foilSaved && <span className="text-xs text-green-500">✓</span>}
                  </div>
                </div>
              )}
            </div>

            {entry && (
              <div className="pt-2 border-t">
                <p className="text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1">
                  <BookOpen size={11} /> Binder
                </p>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={binderInput}
                    onChange={(e) => setBinderInput(e.target.value)}
                    placeholder="Assign to binder…"
                    list="lightbox-binder-suggestions"
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-pokemon-blue"
                    onKeyDown={(e) => e.key === 'Enter' && handleBinderSave()}
                  />
                  <datalist id="lightbox-binder-suggestions">
                    {binderTags.map((t) => <option key={t} value={t} />)}
                  </datalist>
                  <button
                    onClick={handleBinderSave}
                    disabled={updateCard.isPending}
                    className="bg-pokemon-blue text-white text-xs px-2.5 py-1.5 rounded-lg transition-colors hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    {binderSaved ? '✓ Saved' : 'Save'}
                  </button>
                </div>
                {binderInput && (
                  <button
                    onClick={() => { setBinderInput(''); }}
                    className="mt-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    Clear binder
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {card.flavorText && (
          <p className="px-4 pb-4 text-xs text-gray-400 italic border-t pt-3 mx-4">
            "{card.flavorText}"
          </p>
        )}

        {entry && (
          <div className="px-4 pb-4">
            <button
              onClick={() => {
                if (!confirm('Remove this card from your collection?')) return;
                removeCard.mutate(card.id, { onSuccess: onClose });
              }}
              disabled={removeCard.isPending}
              className="w-full flex items-center justify-center gap-2 text-sm text-red-500 border border-red-200 hover:bg-red-50 py-2 rounded-xl transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} /> Remove from Collection
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
