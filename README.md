# PokeTracker — Pokémon TCG Collection Tracker

A full-stack web app for tracking your Pokémon TCG card collection across multiple devices (iPad, Mac, phone). Built for real collectors managing thousands of cards.

## Features

- **7 views**: Dashboard, By Region, By Starter, By Type, By Evolution Stage, Missing Cards, Duplicates
- **Real-time sync** across all devices via shared backend
- **Batch add mode** — browse any set and check off cards you own
- **Binder tagging** — mark which physical binder each card lives in
- **Export/Import** — JSON backup of your entire collection
- **Print checklist** — printable missing card list per set
- **Progress tracking** — completion % per set, region, type
- **Pokemon-themed UI** — type-based color coding, card images from TCG API

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Backend | Express.js + SQLite (better-sqlite3) |
| API | Pokémon TCG API (pokemontcg.io) |
| Frontend deploy | Vercel |
| Backend deploy | Railway |

---

## Local Development

### Prerequisites
- Node.js 18+
- npm 9+

### 1. Backend

```bash
cd backend
cp .env.example .env
# (optional) Add your Pokémon TCG API key to .env for higher rate limits
npm install
npm run dev
```

Backend runs at **http://localhost:3001**

### 2. Frontend

```bash
cd frontend
cp .env.example .env
# .env already points to localhost:3001 by default
npm install
npm run dev
```

Frontend runs at **http://localhost:5173**

The Vite dev server proxies `/api` → `localhost:3001` automatically, so no CORS issues in dev.

---

## Production Deployment

### Backend → Railway

1. Create a new Railway project and link this repo
2. Set the **root directory** to `backend/`
3. Add environment variables in Railway dashboard:
   ```
   PORT=3001
   POKEMON_TCG_API_KEY=your_key_here
   CORS_ORIGINS=https://your-app.vercel.app
   DB_PATH=/app/data/collection.db
   ```
4. Add a **Volume** mount at `/app/data` so the SQLite database persists between deploys
5. Railway auto-detects Node.js and runs `npm install && npm run build && npm start`

### Frontend → Vercel

1. Import the repo in Vercel, set **root directory** to `frontend/`
2. Add environment variable:
   ```
   VITE_API_URL=https://your-backend.railway.app
   ```
3. Deploy — `vercel.json` handles SPA routing automatically

---

## API Reference

All endpoints are prefixed with `/api`.

### Collection

| Method | Path | Description |
|--------|------|-------------|
| GET | `/collection` | Get all collection entries |
| POST | `/collection` | Add a card (`{ cardId, quantity?, binderTag? }`) |
| POST | `/collection/batch` | Add multiple cards (`{ cards: [{cardId, quantity?, binderTag?}] }`) |
| PUT | `/collection/:cardId` | Update quantity/binder (`{ quantity?, binderTag? }`) |
| DELETE | `/collection/:cardId` | Remove card from collection |
| GET | `/collection/stats` | Overall stats (unique, total, duplicates, binders) |
| GET | `/collection/export` | Download JSON backup |
| POST | `/collection/import` | Import from JSON (`{ collection, merge? }`) |

### Cards (Pokémon TCG API proxy with 24h cache)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/cards/sets` | All TCG sets |
| GET | `/cards/set/:setId` | All cards in a set |
| GET | `/cards/search?q=name:pikachu` | Search cards |
| GET | `/cards/card/:cardId` | Single card details |
| GET | `/cards/pokemon/:name` | All cards of a Pokémon by name |
| DELETE | `/cards/cache` | Clear set/card cache |

---

## Pokémon TCG API Key

Without a key you're limited to **1000 requests/day**. Register free at https://pokemontcg.io to get 20,000/day.

Set `POKEMON_TCG_API_KEY` in the backend `.env` (or Railway env vars).

---

## SQLite Database Schema

```sql
-- Your card collection
collection (card_id TEXT PRIMARY KEY, quantity INTEGER, binder_tag TEXT, added_at TEXT, updated_at TEXT)

-- 24-hour cache of TCG API responses (avoids rate limits)
card_cache (id TEXT PRIMARY KEY, data TEXT, cached_at TEXT)
set_cards_cache (set_id TEXT PRIMARY KEY, data TEXT, card_count INTEGER, cached_at TEXT)
sets_cache (cache_key TEXT PRIMARY KEY, data TEXT, cached_at TEXT)
```

---

## Project Structure

```
pokemon-tracker/
├── backend/
│   ├── src/
│   │   ├── index.ts          # Express server
│   │   ├── database.ts       # SQLite init
│   │   └── routes/
│   │       ├── collection.ts # CRUD for collection
│   │       └── cards.ts      # TCG API proxy
│   ├── package.json
│   └── railway.toml
└── frontend/
    ├── src/
    │   ├── components/       # Reusable UI components
    │   ├── hooks/            # React Query hooks
    │   ├── pages/            # Route-level page components
    │   ├── types/            # TypeScript interfaces
    │   └── utils/            # API client, constants
    ├── package.json
    └── vercel.json
```
