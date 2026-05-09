import axios from 'axios';
import type { CollectionEntry, CollectionStats } from '../types';

const BASE = import.meta.env.VITE_API_URL || '';

// ── Collection ID ──────────────────────────────────────────────────────────
// Each family gets a unique 8-character code stored in localStorage.
// Sharing the code syncs collections across devices.

const ID_KEY = 'poketracker-collection-id';

function generateId(): string {
  return Math.random().toString(36).slice(2, 6).toUpperCase() +
         Math.floor(1000 + Math.random() * 9000);
}

export function getCollectionId(): string {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = generateId();
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function setCollectionId(id: string): void {
  localStorage.setItem(ID_KEY, id.trim().toUpperCase());
}

// ── Axios client — injects ?c=<id> on every collection request ─────────────
const client = axios.create({ baseURL: BASE });

client.interceptors.request.use((config) => {
  if (config.url?.startsWith('/api/collection')) {
    config.params = { ...config.params, c: getCollectionId() };
  }
  return config;
});

// ── API helpers ────────────────────────────────────────────────────────────
export const collectionApi = {
  getAll: (): Promise<CollectionEntry[]> =>
    client.get('/api/collection').then((r) => r.data),

  getStats: (): Promise<CollectionStats> =>
    client.get('/api/collection/stats').then((r) => r.data),

  add: (cardId: string, quantity = 1, binderTag?: string, foilType?: string | null): Promise<CollectionEntry> =>
    client.post('/api/collection', { cardId, quantity, binderTag, foilType }).then((r) => r.data),

  batchAdd: (cards: { cardId: string; quantity?: number; binderTag?: string; foilType?: string | null }[]) =>
    client.post('/api/collection/batch', { cards }).then((r) => r.data),

  update: (cardId: string, updates: { quantity?: number; binderTag?: string | null; foilType?: string | null }): Promise<CollectionEntry> =>
    client.put(`/api/collection/${encodeURIComponent(cardId)}`, updates).then((r) => r.data),

  remove: (cardId: string): Promise<void> =>
    client.delete(`/api/collection/${encodeURIComponent(cardId)}`).then((r) => r.data),

  exportCollection: () =>
    client.get('/api/collection/export').then((r) => r.data),

  importCollection: (collection: CollectionEntry[], merge = true) =>
    client.post('/api/collection/import', { collection, merge }).then((r) => r.data),
};

export const cardsApi = {
  getSets: () =>
    client.get('/api/cards/sets').then((r) => r.data),

  getSetCards: (setId: string) =>
    client.get(`/api/cards/set/${encodeURIComponent(setId)}`).then((r) => r.data),

  search: (q: string, page = 1, pageSize = 20) =>
    client.get('/api/cards/search', { params: { q, page, pageSize } }).then((r) => r.data),

  getCard: (cardId: string) =>
    client.get(`/api/cards/card/${encodeURIComponent(cardId)}`).then((r) => r.data),

  getPokemonCards: (name: string) =>
    client.get(`/api/cards/pokemon/${encodeURIComponent(name)}`).then((r) => r.data),
};
