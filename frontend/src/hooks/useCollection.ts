import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { collectionApi } from '../utils/api';
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
  return useMemo(() => {
    const map = new Map<string, CollectionEntry>();
    collection?.forEach((e) => map.set(e.card_id, e));
    return map;
  }, [collection]);
}

export function useCollectionWithCards() {
  return useQuery({
    queryKey: ['collection-with-cards'],
    queryFn: collectionApi.getWithCards,
    staleTime: 30_000,
  });
}

export function useAddCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, quantity = 1, binderTag, foilType }: { cardId: string; quantity?: number; binderTag?: string; foilType?: string | null }) =>
      collectionApi.add(cardId, quantity, binderTag, foilType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collection'] });
      qc.invalidateQueries({ queryKey: ['collection-with-cards'] });
      qc.invalidateQueries({ queryKey: ['collection-stats'] });
    },
  });
}

export function useBatchAddCards() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cards: { cardId: string; quantity?: number; binderTag?: string; foilType?: string | null }[]) =>
      collectionApi.batchAdd(cards),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collection'] });
      qc.invalidateQueries({ queryKey: ['collection-with-cards'] });
      qc.invalidateQueries({ queryKey: ['collection-stats'] });
    },
  });
}

export function useUpdateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, updates }: { cardId: string; updates: { quantity?: number; binderTag?: string | null; foilType?: string | null } }) =>
      collectionApi.update(cardId, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['collection'] });
      qc.invalidateQueries({ queryKey: ['collection-with-cards'] });
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
      qc.invalidateQueries({ queryKey: ['collection-with-cards'] });
      qc.invalidateQueries({ queryKey: ['collection-stats'] });
    },
  });
}

export function useCollectionValue() {
  const { data: ownedCards, isLoading } = useCollectionWithCards();

  const { totalValue, topCards } = useMemo(() => {
    if (!ownedCards) return { totalValue: 0, topCards: [] };

    let total = 0;
    const valued: { card: TCGCard; entry: CollectionEntry; price: number }[] = [];

    ownedCards.forEach(({ entry, card }) => {
      const price = getMarketPrice(card, entry.foil_type);
      if (price != null) {
        total += price * entry.quantity;
        valued.push({ card, entry, price });
      }
    });

    valued.sort((a, b) => b.price - a.price);
    return { totalValue: total, topCards: valued.slice(0, 6) };
  }, [ownedCards]);

  return { totalValue, topCards, isLoading };
}
