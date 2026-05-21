import { useQuery } from '@tanstack/react-query';
import { cardsApi } from '../utils/api';
import { supabase } from '../lib/supabase';
import { useCollection } from './useCollection';
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

/** Returns a Set of Pokémon names the user owns at least one card of,
 *  derived by cross-referencing card_ids in the collection against cards_vectors. */
export function useOwnedPokemonNames(): Set<string> {
  const { data: collection } = useCollection();
  const ownedIds = (collection ?? []).map((e) => e.card_id);

  const CHUNK_SIZE = 150;
  const { data } = useQuery<Set<string>>({
    queryKey: ['owned-pokemon-names', ownedIds],
    queryFn: async () => {
      if (ownedIds.length === 0) return new Set<string>();
      const names = new Set<string>();
      for (let i = 0; i < ownedIds.length; i += CHUNK_SIZE) {
        const chunk = ownedIds.slice(i, i + CHUNK_SIZE);
        const { data: rows } = await supabase
          .from('cards_vectors')
          .select('name')
          .in('card_id', chunk);
        rows?.forEach((r: { name: string }) => names.add(r.name));
      }
      return names;
    },
    enabled: ownedIds.length > 0,
    staleTime: 5 * 60_000,
  });

  return data ?? new Set<string>();
}
