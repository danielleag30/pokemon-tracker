import { useState, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Search, Loader } from 'lucide-react';
import { useCollection, useCollectionStats } from '../hooks/useCollection';
import { cardsApi } from '../utils/api';
import { getMarketPrice, formatPrice } from '../utils/prices';
import { CardLightbox } from '../components/CardLightbox';
import { REGIONS, SERIES_TO_REGION, STARTER_LINES, TYPE_DISPLAY_NAMES } from '../utils/constants';
import type { TCGCard, CollectionEntry } from '../types';

type GroupBy = 'set' | 'region' | 'starter' | 'type' | 'evolution' | 'value';

interface OwnedCard {
  entry: CollectionEntry;
  card: TCGCard;
}

interface Group {
  key: string;
  label: string;
  emoji?: string;
  cards: OwnedCard[];
}

const EVOLUTION_ORDER = [
  'Basic', 'Stage 1', 'Stage 2',
  'V', 'VMAX', 'VSTAR', 'GX', 'EX', 'Mega', 'BREAK', 'LEGEND',
  'Trainer', 'Energy', 'Other',
];

export function MyCards() {
  const [groupBy, setGroupBy] = useState<GroupBy>('set');
  const [selectedBinder, setSelectedBinder] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lightbox, setLightbox] = useState<OwnedCard | null>(null);

  const { data: collection } = useCollection();
  const { data: stats } = useCollectionStats();

  // Extract unique set IDs from the user's card IDs (everything before the last "-")
  const ownedSetIds = useMemo(() => {
    if (!collection) return [];
    const ids = new Set(collection.map((e) => e.card_id.substring(0, e.card_id.lastIndexOf('-'))));
    return [...ids];
  }, [collection]);

  // Fetch full card data for every set the user owns cards from (all cached server-side)
  const setQueries = useQueries({
    queries: ownedSetIds.map((setId) => ({
      queryKey: ['set-cards', setId],
      queryFn: () => cardsApi.getSetCards(setId),
      staleTime: 60 * 60_000,
    })),
  });

  const isLoading = ownedSetIds.length > 0 && setQueries.some((q) => q.isLoading);

  // Build cardId → TCGCard lookup from fetched set data
  const cardDataMap = useMemo(() => {
    const map = new Map<string, TCGCard>();
    setQueries.forEach((q) => {
      q.data?.data?.forEach((card: TCGCard) => map.set(card.id, card));
    });
    return map;
  }, [setQueries]);

  // Full collection with TCGCard data attached
  const allOwnedCards = useMemo((): OwnedCard[] => {
    if (!collection) return [];
    return collection
      .map((entry) => ({ entry, card: cardDataMap.get(entry.card_id) }))
      .filter((item): item is OwnedCard => item.card !== undefined);
  }, [collection, cardDataMap]);

  // Apply binder + search filters
  const filteredCards = useMemo(() => {
    return allOwnedCards.filter(({ entry, card }) => {
      if (selectedBinder !== null && entry.binder_tag !== selectedBinder) return false;
      if (search && !card.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [allOwnedCards, selectedBinder, search]);

  // Group and sort cards by the chosen grouping
  const groups = useMemo((): Group[] => {
    const map = new Map<string, Group>();

    filteredCards.forEach((item) => {
      let key: string;
      let label: string;
      let emoji: string | undefined;

      switch (groupBy) {
        case 'set': {
          key = item.card.set.id;
          label = item.card.set.name;
          break;
        }
        case 'region': {
          const regionId = SERIES_TO_REGION[item.card.set.series] ?? 'other';
          const region = REGIONS.find((r) => r.id === regionId);
          key = regionId;
          label = region?.name ?? 'Other';
          emoji = region?.emoji;
          break;
        }
        case 'type': {
          const type = item.card.types?.[0] ?? (item.card.supertype !== 'Pokémon' ? item.card.supertype : 'Colorless');
          key = type;
          label = TYPE_DISPLAY_NAMES[type] ?? type;
          break;
        }
        case 'evolution': {
          const stage =
            item.card.subtypes?.find((s) => EVOLUTION_ORDER.includes(s)) ??
            (item.card.supertype !== 'Pokémon' ? item.card.supertype : 'Other');
          key = stage;
          label = stage;
          break;
        }
        case 'value': {
          const price = getMarketPrice(item.card);
          if (price == null) { key = 'unpriced'; label = 'No Price Data'; }
          else if (price >= 50)  { key = 'gem';    label = '💎 $50+'; }
          else if (price >= 20)  { key = 'high';   label = '🔥 $20–$49'; }
          else if (price >= 10)  { key = 'mid';    label = '⭐ $10–$19'; }
          else if (price >= 5)   { key = 'low';    label = '✨ $5–$9'; }
          else if (price >= 1)   { key = 'common'; label = '🃏 $1–$4'; }
          else                   { key = 'bulk';   label = '📦 Under $1'; }
          break;
        }
        case 'starter': {
          const line = STARTER_LINES.find((sl) =>
            sl.pokemon.some((p) => p.toLowerCase() === item.card.name.toLowerCase()),
          );
          if (line) {
            key = `${line.region}-${line.type}`;
            const region = REGIONS.find((r) => r.id === line.region);
            label = `${region?.name ?? line.region} — ${line.type}`;
            emoji = line.type === 'Grass' ? '🌿' : line.type === 'Fire' ? '🔥' : '💧';
          } else {
            key = 'other';
            label = 'Other';
          }
          break;
        }
      }

      if (!map.has(key)) map.set(key, { key, label, emoji, cards: [] });
      map.get(key)!.cards.push(item);
    });

    const result = [...map.values()];

    if (groupBy === 'value') {
      const valueOrder = ['gem', 'high', 'mid', 'low', 'common', 'bulk', 'unpriced'];
      result.sort((a, b) => valueOrder.indexOf(a.key) - valueOrder.indexOf(b.key));
      // Within each price tier sort by price desc
      result.forEach((g) => g.cards.sort((a, b) => (getMarketPrice(b.card) ?? 0) - (getMarketPrice(a.card) ?? 0)));
    } else if (groupBy === 'set') {
      result.sort((a, b) => {
        const aDate = a.cards[0]?.card.set.releaseDate ?? '';
        const bDate = b.cards[0]?.card.set.releaseDate ?? '';
        return bDate.localeCompare(aDate);
      });
    } else if (groupBy === 'region') {
      const regionOrder: string[] = REGIONS.map((r) => r.id);
      result.sort((a, b) => {
        const ai = regionOrder.indexOf(a.key);
        const bi = regionOrder.indexOf(b.key);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
    } else if (groupBy === 'evolution') {
      result.sort((a, b) => {
        const ai = EVOLUTION_ORDER.indexOf(a.key);
        const bi = EVOLUTION_ORDER.indexOf(b.key);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
    } else if (groupBy === 'starter') {
      const regionOrder: string[] = REGIONS.map((r) => r.id);
      result.sort((a, b) => {
        if (a.key === 'other') return 1;
        if (b.key === 'other') return -1;
        const [aRegion] = a.key.split('-');
        const [bRegion] = b.key.split('-');
        return regionOrder.indexOf(aRegion) - regionOrder.indexOf(bRegion);
      });
    } else {
      result.sort((a, b) => a.label.localeCompare(b.label));
    }

    return result;
  }, [filteredCards, groupBy]);

  const binders = stats?.binders ?? [];

  const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
    { value: 'set',       label: 'By Set'       },
    { value: 'region',    label: 'By Region'    },
    { value: 'starter',   label: 'By Starter'   },
    { value: 'type',      label: 'By Type'      },
    { value: 'evolution', label: 'By Evolution' },
    { value: 'value',     label: 'By Value'     },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-2xl font-black text-gray-900">My Cards</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {allOwnedCards.length} card{allOwnedCards.length !== 1 ? 's' : ''} in your collection
          {selectedBinder && ` · ${filteredCards.length} in ${selectedBinder}`}
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        {/* Group by */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">Group by</p>
          <div className="flex gap-1.5 flex-wrap">
            {GROUP_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setGroupBy(opt.value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  groupBy === opt.value
                    ? 'bg-pokemon-blue text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Binder filter */}
        {binders.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Binder</p>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setSelectedBinder(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  selectedBinder === null
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              {binders.map(({ binder_tag, count }) => (
                <button
                  key={binder_tag}
                  onClick={() => setSelectedBinder(selectedBinder === binder_tag ? null : binder_tag)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    selectedBinder === binder_tag
                      ? 'bg-purple-600 text-white'
                      : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                  }`}
                >
                  📚 {binder_tag}
                  <span className="ml-1 opacity-70">({count})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by card name…"
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pokemon-blue/30"
          />
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-500">
          <Loader size={20} className="animate-spin mr-2" /> Loading your cards…
        </div>
      )}

      {/* Empty state */}
      {!isLoading && allOwnedCards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <span className="text-5xl mb-3">📭</span>
          <p className="text-sm">No cards in your collection yet.</p>
        </div>
      )}

      {/* No results after filter */}
      {!isLoading && allOwnedCards.length > 0 && filteredCards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-gray-400">
          <p className="text-sm">No cards match your filters.</p>
        </div>
      )}

      {/* Card groups */}
      {!isLoading &&
        groups.map((group) => (
          <div key={group.key} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {group.emoji && <span className="text-lg">{group.emoji}</span>}
              <h2 className="font-bold text-gray-800">{group.label}</h2>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {group.cards.length}
              </span>
              {(() => {
                const groupValue = group.cards.reduce((sum, { card, entry }) => {
                  const p = getMarketPrice(card);
                  return sum + (p != null ? p * entry.quantity : 0);
                }, 0);
                return groupValue > 0 ? (
                  <span className="text-xs text-amber-600 font-semibold ml-auto">
                    {formatPrice(groupValue)}
                  </span>
                ) : null;
              })()}
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
              {group.cards.map(({ entry, card }) => {
                const price = getMarketPrice(card);
                return (
                  <div
                    key={entry.card_id}
                    className="relative group/card cursor-zoom-in"
                    onClick={() => setLightbox({ entry, card })}
                  >
                    <img
                      src={card.images.small}
                      alt={card.name}
                      className="w-full rounded-lg shadow-sm hover:scale-105 transition-transform"
                      title={`${card.name} · ${card.set.name} #${card.number}${price != null ? ` · ${formatPrice(price)}` : ''}`}
                    />
                    {/* Quantity badge */}
                    {entry.quantity > 1 && (
                      <span className="absolute top-0.5 right-0.5 bg-pokemon-blue text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">
                        {entry.quantity}
                      </span>
                    )}
                    {/* Price badge */}
                    {price != null && price >= 5 && (
                      <span className="absolute top-0.5 left-0.5 bg-amber-500 text-white text-xs font-bold rounded px-1 shadow leading-tight">
                        {formatPrice(price)}
                      </span>
                    )}
                    {/* Binder label on hover */}
                    {entry.binder_tag && selectedBinder === null && (
                      <div className="absolute inset-x-0 bottom-0 bg-purple-700/80 text-white text-xs text-center py-0.5 rounded-b-lg truncate px-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                        {entry.binder_tag}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

      {lightbox && (
        <CardLightbox
          card={lightbox.card}
          entry={lightbox.entry}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
