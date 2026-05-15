# PokéTracker — Pokémon TCG Collection Tracker

Multi-user Pokémon TCG collection tracker with an AI chat assistant. Browse your cards by region, type, evolution stage, and more — all synced across devices with a shareable collection code.

**Live:** [Vercel](https://vercel.com) → `VITE_API_URL=https://<your-project-ref>.supabase.co`

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite, deployed on Vercel |
| Backend | Supabase Edge Functions (Deno) |
| Database | Supabase Postgres + pgvector v0.8.0 |
| AI | Ollama Cloud (`gemma4:31b-cloud`, OpenAI-compatible) |
| Embeddings | `gte-small` via Supabase AI (384 dims) |
| Card data | [Pokémon TCG API](https://pokemontcg.io) |

---

## Features

- **9 views** — Dashboard, My Cards, By Set, By Region, By Starter, By Type, By Evolution Stage, Missing Cards, Duplicates
- **Shareable collection code** — 8-char ID stored in localStorage; append `?c=<CODE>` to any URL to switch collections
- **Batch add mode** — browse any set, check off owned cards in bulk
- **Foil tier tracking** — Normal, Reverse Holo, Holo, 1st Edition per card
- **Progress tracking** — completion % per set, region, and type
- **Export / Import** — full JSON backup and restore
- **AI chat assistant** — voice, text, and camera input; RAG-powered over your collection (13k+ cards in pgvector)

---

## Project Structure

```
pokemon-tracker/
├── supabase/
│   ├── config.toml
│   ├── migrations/               # Postgres schema (collection, cards_vectors, caches)
│   └── functions/
│       ├── _shared/              # CORS helpers, Supabase client factory
│       ├── collection/           # Collection CRUD + import/export
│       ├── cards/                # TCG API proxy with set/card cache
│       ├── chat/                 # AI RAG pipeline
│       ├── ingest-cards/         # Fan-out card embedding (pgvector)
│       └── ingest-check/         # Weekly incremental card sync
├── frontend/
│   ├── src/
│   │   ├── components/           # BatchAddModal, ChatModal (voice + camera), CollectionCode
│   │   ├── hooks/                # useCollection, useCards
│   │   ├── pages/                # 9 route pages
│   │   ├── types/
│   │   └── utils/
│   │       └── api.ts            # Axios client → Supabase edge functions
│   └── vercel.json
├── scripts/
│   ├── package.json              # Dependencies for migration script
│   ├── tsconfig.json             # TypeScript config for migration script
│   └── migrate-collection.ts     # One-time JSON → Supabase import
└── .github/workflows/
    ├── supabase-deploy.yml        # Auto-deploy edge functions on push to main
    └── supabase-keepalive.yml     # Ping every 3 days (free tier anti-pause)
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
cp .env.example .env          # set VITE_API_URL
npm run dev
```

`.env` values:

```env
VITE_API_URL=https://<your-project-ref>.supabase.co
```

### Edge Functions (local)

```bash
supabase start
supabase functions serve
```

---

## Deployment

### Edge Functions

```bash
supabase login
supabase link --project-ref <your-project-ref>

supabase functions deploy collection   --no-verify-jwt
supabase functions deploy cards        --no-verify-jwt
supabase functions deploy chat         --no-verify-jwt
supabase functions deploy ingest-cards --no-verify-jwt
supabase functions deploy ingest-check --no-verify-jwt
```

After the first manual deploy, GitHub Actions auto-deploys on every push to `main`.

### Required Edge Function Secrets

Set via [Supabase Dashboard → Edge Functions → Secrets](https://supabase.com/dashboard/project/<your-project-ref>/settings/edge-functions):

| Secret | Description |
|---|---|
| `POKEMON_TCG_API_KEY` | [pokemontcg.io](https://pokemontcg.io) API key |
| `OLLAMA_CLOUD_URL` | Ollama Cloud base URL |
| `OLLAMA_CLOUD_TOKEN` | Ollama Cloud bearer token |
| `OLLAMA_CLOUD_MODEL` | e.g. `gemma4:31b-cloud` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by Supabase.

### Required GitHub Actions Secrets

| Secret | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_DB_PASSWORD` | Supabase Dashboard → Project Settings → Database |

---

## One-Time Setup (already done for BRANTLEY)

### Migrate collection from JSON export

```bash
cd scripts
npm install
SUPABASE_SERVICE_KEY=<your-service-role-key> \
  npx ts-node --transpile-only \
  migrate-collection.ts ~/Downloads/your-export.json
cd backend && npm install
SUPABASE_SERVICE_KEY=your_service_role_key_here \
  npx ts-node ../scripts/migrate-collection.ts \
  ~/Downloads/pokemon-collection-2026-05-12.json
```

### Trigger initial card ingestion (~13k cards → pgvector)

```bash
curl -X POST https://<your-project-ref>.supabase.co/functions/v1/ingest-cards \
  -H "Content-Type: application/json" \
  -d '{"page": 1}'
```

Fans out across all pages automatically. Monitor via Supabase Dashboard → Table Editor → `ingest_queue`. Takes ~10–15 minutes.

---

## Collection Codes

Each user's collection is identified by an 8-character code (e.g., `BRANTLEY`) stored in `localStorage`. Share the code to sync the same collection across multiple devices. Append `?c=<CODE>` to any URL to switch active collections.

---

## Known Quirks

- **Supabase edge runtime strips `/functions/v1` from `req.url`** — the pathname inside a deployed function starts with `/<slug>/...` (e.g., `/cards/sets`), not `/functions/v1/cards/sets`. Path parsing regex must account for this.
- **Free tier anti-pause** — the `supabase-keepalive.yml` workflow pings the project every 3 days to prevent Supabase from pausing inactive projects.
