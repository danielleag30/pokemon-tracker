import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { collectionApi } from '../utils/api';
import type { CollectionEntry } from '../types';

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
