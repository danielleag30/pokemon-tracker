import axios from 'axios';
import type { CollectionEntry, CollectionStats } from '../types';

const BASE = import.meta.env.VITE_API_URL || '';
const FUNCTIONS = `${BASE}/functions/v1`;

// ── Collection ID ──────────────────────────────────────────────────────────
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
  if (config.url?.includes('/functions/v1/collection')) {
    config.params = { ...config.params, c: getCollectionId() };
  }
  return config;
});

// ── API helpers ────────────────────────────────────────────────────────────
export const collectionApi = {
  getAll: (): Promise<CollectionEntry[]> =>
    client.get(`${FUNCTIONS}/collection`).then((r) => r.data),

  getStats: (): Promise<CollectionStats> =>
    client.get(`${FUNCTIONS}/collection/stats`).then((r) => r.data),

  add: (cardId: string, quantity = 1, binderTag?: string, foilType?: string | null): Promise<CollectionEntry> =>
    client.post(`${FUNCTIONS}/collection`, { cardId, quantity, binderTag, foilType }).then((r) => r.data),

  batchAdd: (cards: { cardId: string; quantity?: number; binderTag?: string; foilType?: string | null }[]) =>
    client.post(`${FUNCTIONS}/collection/batch`, { cards }).then((r) => r.data),

  update: (cardId: string, updates: { quantity?: number; binderTag?: string | null; foilType?: string | null }): Promise<CollectionEntry> =>
    client.put(`${FUNCTIONS}/collection/${encodeURIComponent(cardId)}`, updates).then((r) => r.data),

  remove: (cardId: string): Promise<void> =>
    client.delete(`${FUNCTIONS}/collection/${encodeURIComponent(cardId)}`).then((r) => r.data),

  exportCollection: () =>
    client.get(`${FUNCTIONS}/collection/export`).then((r) => r.data),

  importCollection: (collection: CollectionEntry[], merge = true) =>
    client.post(`${FUNCTIONS}/collection/import`, { collection, merge }).then((r) => r.data),
};

export const cardsApi = {
  getSets: () =>
    client.get(`${FUNCTIONS}/cards/sets`).then((r) => r.data),

  getSetCards: (setId: string) =>
    client.get(`${FUNCTIONS}/cards/set/${encodeURIComponent(setId)}`).then((r) => r.data),

  search: (q: string, page = 1, pageSize = 20) =>
    client.get(`${FUNCTIONS}/cards/search`, { params: { q, page, pageSize } }).then((r) => r.data),

  getCard: (cardId: string) =>
    client.get(`${FUNCTIONS}/cards/card/${encodeURIComponent(cardId)}`).then((r) => r.data),

  getPokemonCards: (name: string) =>
    client.get(`${FUNCTIONS}/cards/pokemon/${encodeURIComponent(name)}`).then((r) => r.data),
};

export const chatApi = {
  send: (
    message: string,
    pageContext?: { page?: string; setId?: string; regionId?: string; visibleCardIds?: string[] }
  ): Promise<{ reply: string; cardIds: string[] }> =>
    client.post(`${FUNCTIONS}/chat`, {
      message,
      collectionId: getCollectionId(),
      pageContext,
    }).then((r) => r.data),
};
