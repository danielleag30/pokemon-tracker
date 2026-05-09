import { useQuery } from '@tanstack/react-query';
import { cardsApi } from '../utils/api';
import type { TCGSet, TCGCard } from '../types';

export function useSets() {
  return useQuery<{ data: TCGSet[] }>({
    queryKey: ['sets'],
    queryFn: cardsApi.getSets,
    staleTime: 60 * 60_000, // 1 hour
  });
}

export function useSetCards(setId: string | null) {
  return useQuery<{ data: TCGCard[]; count: number }>({
    queryKey: ['set-cards', setId],
    queryFn: () => cardsApi.getSetCards(setId!),
    enabled: !!setId,
    staleTime: 60 * 60_000,
  });
}

export function useCardSearch(query: string, enabled = true) {
  return useQuery<{ data: TCGCard[]; totalCount: number }>({
    queryKey: ['card-search', query],
    queryFn: () => cardsApi.search(query, 1, 30),
    enabled: enabled && query.length >= 2,
    staleTime: 5 * 60_000,
  });
}

export function useBatchSearch(query: string, enabled = true) {
  return useQuery<{ data: TCGCard[]; totalCount: number }>({
    queryKey: ['batch-search', query],
    queryFn: () => cardsApi.search(query, 1, 100),
    enabled: enabled && query.length >= 2,
    staleTime: 5 * 60_000,
  });
}

export function usePokemonCards(name: string, enabled = true) {
  return useQuery<{ data: TCGCard[] }>({
    queryKey: ['pokemon-cards', name],
    queryFn: () => cardsApi.getPokemonCards(name),
    enabled: enabled && !!name,
    staleTime: 60 * 60_000,
  });
}
