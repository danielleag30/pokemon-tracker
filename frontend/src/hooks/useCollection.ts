import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { collectionApi, cardsApi } from '../utils/api';
import { getMarketPrice } from '../utils/prices';
import type { CollectionEntry, TCGCard } from '../types';

export function useCollection() {
  return useQuery({
    queryKey: ['collection'],
    queryFn: collectionApi.getAll,
    staleTime: 30_000,
  });
}

export function useCollectionStats() {
  return useQuery({
    queryKey: ['collection-stats'],
    queryFn: collectionApi.getStats,
    staleTime: 30_000,
  });
}

export function useCollectionMap() {
  const { data: collection } = useCollection();
  const map = new Map<string, CollectionEntry>();
  collection?.forEach((e) => map.set(e.card_id, e));
  return map;
}

export function useAddCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, quantity = 1, binderTag }: { cardId: string; quantity?: number; binderTag?: string }) =>
      collectionApi.add(cardId, quantity, binderTag),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collection'] });
      qc.invalidateQueries({ queryKey: ['collection-stats'] });
    },
  });
}

export function useBatchAddCards() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cards: { cardId: string; quantity?: number; binderTag?: string }[]) =>
      collectionApi.batchAdd(cards),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collection'] });
      qc.invalidateQueries({ queryKey: ['collection-stats'] });
    },
  });
}

export function useUpdateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, updates }: { cardId: string; updates: { quantity?: number; binderTag?: string | null } }) =>
      collectionApi.update(cardId, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collection'] });
      qc.invalidateQueries({ queryKey: ['collection-stats'] });
    },
  });
}

export function useRemoveCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cardId: string) => collectionApi.remove(cardId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collection'] });
      qc.invalidateQueries({ queryKey: ['collection-stats'] });
    },
  });
}

export function useCollectionValue() {
  const { data: collection } = useCollection();

  const ownedSetIds = useMemo(() => {
    if (!collection) return [];
    const ids = new Set(collection.map((e) => e.card_id.substring(0, e.card_id.lastIndexOf('-'))));
    return [...ids];
  }, [collection]);

  const setQueries = useQueries({
    queries: ownedSetIds.map((setId) => ({
      queryKey: ['set-cards', setId],
      queryFn: () => cardsApi.getSetCards(setId),
      staleTime: 60 * 60_000,
    })),
  });

  const isLoading = ownedSetIds.length > 0 && setQueries.some((q) => q.isLoading);

  const cardDataMap = useMemo(() => {
    const map = new Map<string, TCGCard>();
    setQueries.forEach((q) => {
      q.data?.data?.forEach((card: TCGCard) => map.set(card.id, card));
    });
    return map;
  }, [setQueries]);

  const { totalValue, topCards } = useMemo(() => {
    if (!collection) return { totalValue: 0, topCards: [] };

    let total = 0;
    const valued: { card: TCGCard; entry: CollectionEntry; price: number }[] = [];

    collection.forEach((entry) => {
      const card = cardDataMap.get(entry.card_id);
      if (!card) return;
      const price = getMarketPrice(card);
      if (price != null) {
        total += price * entry.quantity;
        valued.push({ card, entry, price });
      }
    });

    valued.sort((a, b) => b.price - a.price);
    return { totalValue: total, topCards: valued.slice(0, 6) };
  }, [collection, cardDataMap]);

  return { totalValue, topCards, isLoading };
}
