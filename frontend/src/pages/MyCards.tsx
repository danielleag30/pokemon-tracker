import { useState, useMemo } from 'react';
import { Search, Loader, Trash2, CheckSquare, Square, X } from 'lucide-react';
import { useCollectionWithCards, useCollectionStats, useRemoveCard, usePricesUpdatedAt } from '../hooks/useCollection';
import { getMarketPrice, formatPrice, getDefaultTier } from '../utils/prices';
import { CardLightbox } from '../components/CardLightbox';
import { STARTER_LINES, TYPE_DISPLAY_NAMES, REGIONS } from '../utils/constants';
import { FOIL_LABELS, FOIL_PRIORITY, type FoilType } from '../types';
import type { TCGCard, CollectionEntry } from '../types';

type GroupBy = 'set' | 'series' | 'starter' | 'type' | 'evolution' | 'value';

interface OwnedCard {
  entry: CollectionEntry;
  card: TCGCard;
  pricesUpdatedAt: string | null;
}

// card is null when the catalog doesn't have this card_id yet (ingest gap,
// or a set pokemontcg.io doesn't carry at all) — rendered separately below.
interface PendingCard {
  entry: CollectionEntry;
  card: null;
  pricesUpdatedAt: string | null;
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
  const [selectedFoil, setSelectedFoil] = useState<FoilType | null>(null);
  const [search, setSearch] = useState('');
  const [lightbox, setLightbox] = useState<OwnedCard | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: ownedCards, isLoading } = useCollectionWithCards();
  const { data: stats } = useCollectionStats();
  const removeCard = useRemoveCard();
  const { latest: pricesUpdatedAt } = usePricesUpdatedAt();

  const allOwnedCards = ownedCards ?? [];

  // Split off cards the catalog doesn't have data for yet — grouping/pricing/
  // search all need real card data, so they only ever operate on resolvedCards.
  const resolvedCards = useMemo(
    (): OwnedCard[] => allOwnedCards.filter((c): c is OwnedCard => c.card !== null),
    [allOwnedCards],
  );
  const pendingCards = useMemo(
    (): PendingCard[] => allOwnedCards.filter((c): c is PendingCard => c.card === null),
    [allOwnedCards],
  );

  // Precompute price once per card — reused in groupBy bucketing, sort, group header, and card tile.
  // Must pass entry.foil_type: Dashboard's useCollectionValue prices the exact
  // owned tier, and pricing the default tier here instead silently disagreed
  // with it (measured $2,220.74 vs $2,260.69 on live data — 74 of 737 rows).
  const priceMap = useMemo(() => {
    const map = new Map<string, number | null>();
    resolvedCards.forEach(({ card, entry }) => map.set(card.id, getMarketPrice(card, entry.foil_type)));
    return map;
  }, [resolvedCards]);

  // Which foil tiers are actually used in the collection
  // null foil_type resolves to the card's most basic available version
  const usedFoilTiers = useMemo(() => {
    const tiers = new Set(resolvedCards.map(({ entry, card }) => entry.foil_type ?? getDefaultTier(card) ?? 'normal'));
    return FOIL_PRIORITY.filter((t) => tiers.has(t));
  }, [resolvedCards]);

  // Apply binder + foil + search filters
  const filteredCards = useMemo(() => {
    return resolvedCards.filter(({ entry, card }) => {
      if (selectedBinder !== null && entry.binder_tag !== selectedBinder) return false;
      if (selectedFoil !== null && (entry.foil_type ?? getDefaultTier(card) ?? 'normal') !== selectedFoil) return false;
      if (search && !card.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [resolvedCards, selectedBinder, selectedFoil, search]);

  // Pending cards respect the binder filter (we know that much without catalog data)
  const filteredPendingCards = useMemo(
    () => pendingCards.filter(({ entry }) => selectedBinder === null || entry.binder_tag === selectedBinder),
    [pendingCards, selectedBinder],
  );

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
        case 'series': {
          key = item.card.set.series ?? 'Other';
          label = item.card.set.series ?? 'Other';
          emoji = REGIONS.find((r) => r.series.includes(item.card.set.series))?.emoji;
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
          const price = priceMap.get(item.card.id) ?? null;
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
      result.forEach((g) => g.cards.sort((a, b) => (priceMap.get(b.card.id) ?? 0) - (priceMap.get(a.card.id) ?? 0)));
    } else if (groupBy === 'set') {
      result.sort((a, b) => {
        const aDate = a.cards[0]?.card.set.releaseDate ?? '';
        const bDate = b.cards[0]?.card.set.releaseDate ?? '';
        return bDate.localeCompare(aDate);
      });
    } else if (groupBy === 'series') {
      // Sort by the earliest card release date within each series group
      result.sort((a, b) => {
        const aDate = a.cards[0]?.card.set.releaseDate ?? '';
        const bDate = b.cards[0]?.card.set.releaseDate ?? '';
        return aDate.localeCompare(bDate);
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
  }, [filteredCards, groupBy, priceMap]);

  const binders = stats?.binders ?? [];

  const toggleSelect = (cardId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(cardId) ? next.delete(cardId) : next.add(cardId);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Remove ${selectedIds.size} card${selectedIds.size !== 1 ? 's' : ''} from your collection?`)) return;
    await Promise.all([...selectedIds].map((id) => removeCard.mutateAsync(id)));
    exitSelectMode();
  };

  const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
    { value: 'set',       label: 'By Set'       },
    { value: 'series',    label: 'By Series'    },
    { value: 'starter',   label: 'By Starter'   },
    { value: 'type',      label: 'By Type'      },
    { value: 'evolution', label: 'By Evolution' },
    { value: 'value',     label: 'By Value'     },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900">My Cards</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {allOwnedCards.length} card{allOwnedCards.length !== 1 ? 's' : ''} in your collection
            {selectedBinder && ` · ${filteredCards.length} in ${selectedBinder}`}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {pricesUpdatedAt
              ? `Prices as of ${pricesUpdatedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
              : 'Prices not yet refreshed'}
          </p>
        </div>
        <div className="flex gap-2">
          {selectMode ? (
            <>
              <button
                onClick={handleDeleteSelected}
                disabled={selectedIds.size === 0 || removeCard.isPending}
                className="flex items-center gap-1.5 text-sm bg-red-500 text-white px-3 py-2 rounded-xl hover:bg-red-600 disabled:opacity-40 transition-colors"
              >
                <Trash2 size={14} /> Delete Selected ({selectedIds.size})
              </button>
              <button
                onClick={exitSelectMode}
                className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-2 rounded-xl transition-colors"
              >
                <X size={14} /> Cancel
              </button>
            </>
          ) : (
            <button
              onClick={() => setSelectMode(true)}
              className="flex items-center gap-1.5 text-sm text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-2 rounded-xl transition-colors"
            >
              <CheckSquare size={14} /> Select
            </button>
          )}
        </div>
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

        {/* Foil tier filter */}
        {usedFoilTiers.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Card Type</p>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setSelectedFoil(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  selectedFoil === null
                    ? 'bg-yellow-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              {usedFoilTiers.map((tier) => (
                <button
                  key={tier}
                  onClick={() => setSelectedFoil(selectedFoil === tier ? null : tier)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                    selectedFoil === tier
                      ? 'bg-yellow-500 text-white'
                      : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                  }`}
                >
                  ✨ {FOIL_LABELS[tier]}
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
      {!isLoading && allOwnedCards.length > 0 && filteredCards.length === 0 && filteredPendingCards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-10 text-gray-400">
          <p className="text-sm">No cards match your filters.</p>
        </div>
      )}

      {/* Catalog data pending — owned cards not yet in the catalog */}
      {!isLoading && filteredPendingCards.length > 0 && (
        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-lg">⏳</span>
            <h2 className="font-bold text-amber-800">Catalog Data Pending</h2>
            <span className="text-xs text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
              {filteredPendingCards.length}
            </span>
          </div>
          <p className="text-xs text-amber-700 mb-3">
            These cards are in your collection but haven't finished syncing from the card database yet — no image or price until they do.
          </p>
          <div className="flex flex-wrap gap-2">
            {filteredPendingCards.map(({ entry }) => (
              <div
                key={entry.card_id}
                className="text-xs bg-white text-amber-800 border border-amber-200 rounded-lg px-2 py-1.5"
                title={entry.card_id}
              >
                {entry.card_id}
                {entry.quantity > 1 && <span className="ml-1 font-semibold">×{entry.quantity}</span>}
              </div>
            ))}
          </div>
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
                  const p = priceMap.get(card.id) ?? null;
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
                const price = priceMap.get(card.id) ?? null;
                const isSelected = selectedIds.has(entry.card_id);
                return (
                  <div
                    key={entry.card_id}
                    className={`relative group/card cursor-pointer ${selectMode ? '' : 'cursor-zoom-in'} ${isSelected ? 'ring-2 ring-red-500 rounded-lg' : ''}`}
                    onClick={() => selectMode ? toggleSelect(entry.card_id) : setLightbox({ entry, card, pricesUpdatedAt: null })}
                  >
                    <img
                      src={card.images.small}
                      alt={card.name}
                      className={`w-full rounded-lg shadow-sm transition-transform ${selectMode ? '' : 'hover:scale-105'} ${isSelected ? 'opacity-70' : ''}`}
                      title={`${card.name} · ${card.set.name} #${card.number}${price != null ? ` · ${formatPrice(price)}` : ''}`}
                    />
                    {/* Selection checkbox */}
                    {selectMode && (
                      <div className="absolute top-0.5 right-0.5">
                        {isSelected
                          ? <CheckSquare size={16} className="text-red-500 drop-shadow" />
                          : <Square size={16} className="text-white drop-shadow" />}
                      </div>
                    )}
                    {/* Quantity badge */}
                    {entry.quantity > 1 && !selectMode && (
                      <span className="absolute top-0.5 right-0.5 bg-pokemon-blue text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow">
                        {entry.quantity}
                      </span>
                    )}
                    {/* Price badge */}
                    {price != null && price >= 5 && !selectMode && (
                      <span className="absolute bottom-0.5 left-0.5 bg-amber-500 text-white text-xs font-bold rounded px-1 shadow leading-tight">
                        {formatPrice(price)}
                      </span>
                    )}
                    {/* Binder label on hover */}
                    {entry.binder_tag && selectedBinder === null && !selectMode && (
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
