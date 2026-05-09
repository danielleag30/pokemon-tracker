import { useState } from 'react';
import { Plus, Minus, BookOpen, Check } from 'lucide-react';
import { TypeBadge } from './TypeBadge';
import { CardLightbox } from './CardLightbox';
import { useAddCard, useUpdateCard, useRemoveCard } from '../hooks/useCollection';
import { getAvailableTiers, getDefaultTier } from '../utils/prices';
import { FOIL_LABELS, type FoilType } from '../types';
import type { TCGCard, CollectionEntry } from '../types';

interface Props {
  card: TCGCard;
  collectionEntry?: CollectionEntry;
  binderTags?: string[];
}

export function CardItem({ card, collectionEntry, binderTags = [] }: Props) {
  const availableTiers = getAvailableTiers(card);
  const defaultTier = getDefaultTier(card);

  const [showBinder, setShowBinder] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [binderInput, setBinderInput] = useState(collectionEntry?.binder_tag ?? '');
  const [imgError, setImgError] = useState(false);
  const [selectedTier, setSelectedTier] = useState<FoilType | null>(defaultTier);

  const addCard = useAddCard();
  const updateCard = useUpdateCard();
  const removeCard = useRemoveCard();

  const owned = !!collectionEntry;
  const qty = collectionEntry?.quantity ?? 0;

  const handleAdd = () => {
    addCard.mutate({ cardId: card.id, quantity: 1, binderTag: binderInput || undefined, foilType: selectedTier });
  };

  const handleIncrement = () => {
    updateCard.mutate({ cardId: card.id, updates: { quantity: qty + 1 } });
  };

  const handleDecrement = () => {
    if (qty <= 1) {
      removeCard.mutate(card.id);
    } else {
      updateCard.mutate({ cardId: card.id, updates: { quantity: qty - 1 } });
    }
  };

  const handleBinderSave = () => {
    if (owned) {
      updateCard.mutate({ cardId: card.id, updates: { binderTag: binderInput || null } });
    }
    setShowBinder(false);
  };

  const isPending = addCard.isPending || updateCard.isPending || removeCard.isPending;

  return (
    <>
    <div
      className={`relative rounded-xl overflow-hidden shadow-md transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 bg-white ${
        owned ? 'ring-2 ring-green-400' : 'opacity-80 hover:opacity-100'
      }`}
    >
      {owned && (
        <div className="absolute top-2 right-2 z-10 bg-green-400 rounded-full p-0.5">
          <Check size={10} className="text-white" strokeWidth={3} />
        </div>
      )}

      {qty > 1 && (
        <div className="absolute top-2 left-2 z-10 bg-pokemon-blue text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {qty}
        </div>
      )}

      <div
        className="aspect-[2.5/3.5] bg-gray-100 relative overflow-hidden cursor-zoom-in"
        onClick={() => setShowLightbox(true)}
      >
        {!imgError ? (
          <img
            src={card.images.small}
            alt={card.name}
            className="w-full h-full object-contain"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
            <div className="text-3xl mb-1">🃏</div>
            <p className="text-xs text-gray-500 font-medium leading-tight">{card.name}</p>
          </div>
        )}
      </div>

      <div className="p-2">
        <p className="text-xs font-semibold text-gray-800 truncate leading-tight">{card.name}</p>
        <p className="text-xs text-gray-400 truncate">
          {card.set.name} #{card.number}
        </p>

        <div className="flex gap-1 mt-1 flex-wrap">
          {card.types?.map((t) => <TypeBadge key={t} type={t} size="sm" />)}
          {card.subtypes?.slice(0, 1).map((s) => (
            <span key={s} className="text-xs text-gray-500 bg-gray-100 rounded px-1">
              {s}
            </span>
          ))}
        </div>

        {collectionEntry?.binder_tag && (
          <div className="mt-1 flex items-center gap-1">
            <BookOpen size={10} className="text-gray-400" />
            <span className="text-xs text-gray-500 truncate">{collectionEntry.binder_tag}</span>
          </div>
        )}

        {!owned && availableTiers.length > 1 && (
          <div className="mt-1.5">
            <select
              value={selectedTier ?? ''}
              onChange={(e) => setSelectedTier(e.target.value as FoilType)}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-pokemon-blue bg-white"
            >
              {availableTiers.map((t) => (
                <option key={t} value={t}>{FOIL_LABELS[t]}</option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-2 flex gap-1 items-center">
          {!owned ? (
            <button
              onClick={handleAdd}
              disabled={isPending}
              className="flex-1 bg-pokemon-blue hover:bg-blue-700 text-white text-xs font-semibold py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              + Add
            </button>
          ) : (
            <>
              <button
                onClick={handleDecrement}
                disabled={isPending}
                className="bg-red-100 hover:bg-red-200 text-red-600 rounded-lg p-1.5 transition-colors disabled:opacity-50"
              >
                <Minus size={12} />
              </button>
              <span className="flex-1 text-center text-sm font-bold text-gray-700">{qty}</span>
              <button
                onClick={handleIncrement}
                disabled={isPending}
                className="bg-green-100 hover:bg-green-200 text-green-600 rounded-lg p-1.5 transition-colors disabled:opacity-50"
              >
                <Plus size={12} />
              </button>
              <button
                onClick={() => setShowBinder(!showBinder)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg p-1.5 transition-colors"
              >
                <BookOpen size={12} />
              </button>
            </>
          )}
        </div>

        {showBinder && (
          <div className="mt-2 flex gap-1">
            <input
              type="text"
              value={binderInput}
              onChange={(e) => setBinderInput(e.target.value)}
              placeholder="Binder name…"
              list="binder-suggestions"
              className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-pokemon-blue"
              onKeyDown={(e) => e.key === 'Enter' && handleBinderSave()}
            />
            <datalist id="binder-suggestions">
              {binderTags.map((t) => <option key={t} value={t} />)}
            </datalist>
            <button
              onClick={handleBinderSave}
              className="bg-pokemon-blue text-white text-xs px-2 py-1 rounded transition-colors hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>

    {showLightbox && (
      <CardLightbox
        card={card}
        entry={collectionEntry}
        onClose={() => setShowLightbox(false)}
      />
    )}
    </>
  );
}
