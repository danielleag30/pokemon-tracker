import axios from 'axios';
import type { CollectionEntry, CollectionStats } from '../types';
import { supabase } from '../lib/supabase';

const BASE = import.meta.env.VITE_API_URL || '';
const FUNCTIONS = `${BASE}/functions/v1`;

// ── Axios client — injects Authorization: Bearer on every collection/chat request ──
const client = axios.create({ baseURL: BASE });

client.interceptors.request.use(async (config) => {
  const needsAuth =
    config.url?.includes('/functions/v1/collection') ||
    config.url?.includes('/functions/v1/chat') ||
    config.url?.includes('/functions/v1/admin');

  if (needsAuth) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      config.headers = config.headers ?? {};
      config.headers['Authorization'] = `Bearer ${session.access_token}`;
    }
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
  ): Promise<{ reply: string; cardIds: string[]; intent: string }> =>
    client.post(`${FUNCTIONS}/chat`, { message, pageContext }).then((r) => r.data),

  feedback: (payload: {
    message: string;
    reply: string;
    rating: 1 | -1;
    note?: string;
    pageContext?: object;
    intent?: string;
  }): Promise<void> =>
    client.post(`${FUNCTIONS}/chat/feedback`, payload).then((r) => r.data),
};

export const adminApi = {
  getUsers:          () => client.get(`${FUNCTIONS}/admin/users`).then((r) => r.data),
  getChatFeedback:   () => client.get(`${FUNCTIONS}/admin/feedback/chat`).then((r) => r.data),
  getGeneralFeedback:() => client.get(`${FUNCTIONS}/admin/feedback/general`).then((r) => r.data),
  getMetrics:        () => client.get(`${FUNCTIONS}/admin/metrics`).then((r) => r.data),
  getChatLogs:       (limit = 100, offset = 0) => client.get(`${FUNCTIONS}/admin/logs`, { params: { limit, offset } }).then((r) => r.data),
  getChatVolume:     () => client.get(`${FUNCTIONS}/admin/logs/volume`).then((r) => r.data),
  getIntentBreakdown:() => client.get(`${FUNCTIONS}/admin/logs/intents`).then((r) => r.data),
  getUserChatLogs:   (userId: string) => client.get(`${FUNCTIONS}/admin/users/${userId}/logs`).then((r) => r.data),
  createUser:        (payload: { username: string; pin: string; realEmail: string; isChild: boolean }) =>
                       client.post(`${FUNCTIONS}/admin/users`, payload).then((r) => r.data),
  deleteUser:        (userId: string) => client.delete(`${FUNCTIONS}/admin/users/${userId}`).then((r) => r.data),
  resetUserPin:      (userId: string, newPin: string) =>
                       client.patch(`${FUNCTIONS}/admin/users/${userId}`, { resetPin: newPin }).then((r) => r.data),
  toggleUserType:    (userId: string, isChild: boolean) =>
                       client.patch(`${FUNCTIONS}/admin/users/${userId}`, { isChild }).then((r) => r.data),
};

export const feedbackApi = {
  submitGeneral: async (rating: number, note?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { error } = await supabase.from('general_feedback').insert({ user_id: user.id, rating, note: note || null });
    if (error) throw error;
  },
};
