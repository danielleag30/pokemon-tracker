# PokéTracker

A full-stack Pokémon TCG collection tracker with an AI chat assistant. Browse, filter, and manage your cards across 9 views — by region, type, set, evolution stage, and more — with real-time sync across devices via a shareable collection code.

---

## Features

- **9 views** — Dashboard, My Cards, By Set, By Region, By Starter, By Type, By Evolution Stage, Missing Cards, Duplicates
- **AI chat assistant** — ask questions about your collection in plain English; powered by a full RAG pipeline over 13k+ indexed cards
- **Voice & camera input** — speak queries or photograph a card to identify it
- **Batch add mode** — browse any set and check off owned cards in bulk
- **Foil tier tracking** — Normal, Reverse Holo, Holo, and 1st Edition tracked per card
- **Set & region completion** — progress bars and missing card lists per set, region, and type
- **Shareable collection codes** — 8-character ID; append `?c=<CODE>` to any URL to share or switch collections
- **Export / Import** — full JSON backup and restore
- **Admin dashboard** — LLM usage metrics, chat logs, intent breakdown, user management

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite, deployed on Vercel |
| Backend | Supabase Edge Functions (Deno/TypeScript) |
| Database | Supabase Postgres + pgvector v0.8.0 |
| AI / LLM | Ollama Cloud (`gemma4:31b-cloud`, OpenAI-compatible API) |
| Embeddings | `gte-small` via Supabase AI (384 dimensions) |
| Card data | [Pokémon TCG API](https://pokemontcg.io) |
| CI/CD | GitHub Actions → Supabase auto-deploy |

---

## How the AI Works (RAG Pipeline)

The chat assistant uses Retrieval-Augmented Generation to answer questions grounded in your actual collection.

```
User query
    │
    ▼
Intent detection (11 types: owned_search, set_completion, filter_type, foil, region, …)
    │
    ▼
Embed query with gte-small (same model used at ingest time)
    │
    ▼
Route to specialized SQL function
    ├─ match_owned_cards()       ← semantic search scoped to your cards
    ├─ match_cards()             ← global search across all 13k+ cards
    ├─ get_set_completion()      ← "what's missing from Base Set?"
    ├─ get_all_set_completion()  ← "which sets am I closest to finishing?"
    ├─ collection_by_filter()    ← "fire type rares"
    ├─ get_collection_with_foil()← "1st edition cards"
    └─ get_collection_by_region()← "my Kanto cards"
    │
    ▼
Build context (retrieved cards + collection summary + page context)
    │
    ▼
Call LLM (gemma4 31B via Ollama Cloud)
    │
    ▼
Stream reply → log intent, latency, token usage → render card images inline
```

**Ingestion** runs weekly via `ingest-check`: new sets are fetched from the TCG API, each card's metadata is formatted into a text chunk, embedded with `gte-small`, and upserted into `cards_vectors` (a pgvector table with an HNSW cosine-similarity index). The initial run indexes ~13k cards and takes 10–15 minutes.

---

## Project Structure

```
pokemon-tracker/
├── supabase/
│   ├── config.toml
│   ├── migrations/                 # Postgres schema (collection, cards_vectors, chat_logs)
│   └── functions/
│       ├── _shared/                # CORS helpers, Supabase client factory
│       ├── auth/                   # Login, register, pin reset
│       ├── collection/             # CRUD + import/export
│       ├── cards/                  # TCG API proxy with set/card cache
│       ├── chat/                   # RAG pipeline + LLM call
│       ├── admin/                  # Admin metrics + user management RPCs
│       ├── ingest-cards/           # Fan-out embedding pipeline
│       └── ingest-check/           # Weekly incremental sync
├── frontend/
│   └── src/
│       ├── components/             # ChatModal, BatchAddModal, CardGrid, NavBar, …
│       ├── hooks/                  # useCollection, useCards
│       ├── pages/                  # 9 route pages + Admin
│       ├── types/
│       └── utils/
│           └── api.ts              # Axios client → Supabase edge functions
├── scripts/
│   └── migrate-collection.ts      # One-time JSON → Supabase import
└── .github/workflows/
    ├── supabase-deploy.yml         # Auto-deploy edge functions on push to main
    └── supabase-keepalive.yml      # Ping every 3 days (free tier anti-pause)
```

---

## Local Development

### Prerequisites

- Node 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli)

### Frontend

```bash
cd frontend
npm install
cp .env.example .env     # fill in VITE_API_URL
npm run dev
```

`.env`:
```env
VITE_API_URL=https://<your-project-ref>.supabase.co
```

### Edge Functions

```bash
supabase start
supabase functions serve
```

---

## Deployment

### 1. Link your Supabase project

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

### 2. Push the database schema

```bash
supabase db push
```

### 3. Deploy edge functions

```bash
supabase functions deploy auth         --no-verify-jwt
supabase functions deploy collection   --no-verify-jwt
supabase functions deploy cards        --no-verify-jwt
supabase functions deploy chat         --no-verify-jwt
supabase functions deploy admin        --no-verify-jwt
supabase functions deploy ingest-cards --no-verify-jwt
supabase functions deploy ingest-check --no-verify-jwt
```

After the first manual deploy, GitHub Actions handles all subsequent deploys on push to `main`.

### 4. Set edge function secrets

In the [Supabase Dashboard → Edge Functions → Secrets](https://supabase.com/dashboard):

| Secret | Description |
|---|---|
| `POKEMON_TCG_API_KEY` | [pokemontcg.io](https://pokemontcg.io) API key |
| `OLLAMA_CLOUD_URL` | Ollama Cloud base URL |
| `OLLAMA_CLOUD_TOKEN` | Ollama Cloud bearer token |
| `OLLAMA_CLOUD_MODEL` | e.g. `gemma4:31b-cloud` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### 5. Set GitHub Actions secrets

| Secret | Where |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | Supabase Dashboard → Project Settings → Database |

### 6. Trigger initial card ingestion

```bash
curl -X POST https://<your-project-ref>.supabase.co/functions/v1/ingest-cards \
  -H "Content-Type: application/json" \
  -d '{"page": 1}'
```

This fans out automatically across all pages (~13k cards, 10–15 min). Monitor progress in Table Editor → `ingest_queue`.

---

## Collection Codes

Each collection is identified by an 8-character code stored in `localStorage` (e.g., `BRANTLEY`). Appending `?c=<CODE>` to any URL switches the active collection — useful for sharing with friends or syncing across devices without an account.

### Import an existing collection from JSON

```bash
cd scripts
npm install
SUPABASE_SERVICE_KEY=<your-service-role-key> \
  npx ts-node --transpile-only migrate-collection.ts ~/Downloads/your-export.json
```

---

## Known Quirks

- **Edge runtime URL stripping** — Supabase strips `/functions/v1` from `req.url` inside a deployed function. Path parsing must match `/<slug>/...`, not `/functions/v1/<slug>/...`.
- **Free tier anti-pause** — `supabase-keepalive.yml` pings the project every 3 days to prevent Supabase from pausing inactive free-tier projects.
- **Embedding model parity** — both ingest and query use `gte-small`. Swapping models requires re-ingesting all cards.
