# PokeTracker — Pokémon TCG Collection Tracker

Multi-user Pokémon card collection tracker with AI chat assistant.

**Stack:** React + TypeScript + Vite (Vercel) / Supabase Edge Functions (Deno) / Supabase Postgres + pgvector / Ollama Cloud

---

## Features

- **7 views**: Dashboard, By Region, By Starter, By Type, By Evolution Stage, Missing Cards, Duplicates
- **Real-time sync** across all devices via shared collection code
- **Batch add mode** — browse any set and check off cards you own
- **Foil tier tracking** — Normal, Reverse Holo, Holo, 1st Ed variants per card
- **Export/Import** — JSON backup of your entire collection
- **Progress tracking** — completion % per set, region, type
- **AI chat assistant** — voice, text, and camera input; knows what you own

---

## Post-Merge Setup Checklist

### 1 — Set Supabase Edge Function Secrets

[Supabase Dashboard](https://supabase.com/dashboard/project/wmwpjkfgapqyyjsjuhos/settings/edge-functions) → Settings → Edge Functions → Secrets:

| Secret | Value |
|---|---|
| `POKEMON_TCG_API_KEY` | your TCG API key |
| `OLLAMA_CLOUD_URL` | `https://ollama.com/v1` |
| `OLLAMA_CLOUD_TOKEN` | your Ollama Cloud bearer token |
| `OLLAMA_CLOUD_MODEL` | `gemma4:31b-cloud` |

### 2 — Add GitHub Actions Secrets

GitHub repo → Settings → Secrets → Actions:

| Secret | How to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_DB_PASSWORD` | Supabase Dashboard → Project Settings → Database |

### 3 — Deploy Edge Functions (first time only)

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref wmwpjkfgapqyyjsjuhos
supabase functions deploy collection   --no-verify-jwt
supabase functions deploy cards        --no-verify-jwt
supabase functions deploy chat         --no-verify-jwt
supabase functions deploy ingest-cards --no-verify-jwt
supabase functions deploy ingest-check --no-verify-jwt
```

After the first deploy, GitHub Actions auto-deploys on every push to `main`.

### 4 — Migrate Existing Collection Data

```bash
cd backend && npm install
SUPABASE_SERVICE_KEY=sb_secret_Tzv32N_uyEgwl14VOOw_tA_FjQj8kD3 \
  npx ts-node ../scripts/migrate-collection.ts \
  ~/Downloads/pokemon-collection-2026-05-12.json
```

### 5 — Trigger Initial Card Ingestion (one-time, ~13k cards → pgvector)

```bash
curl -X POST https://wmwpjkfgapqyyjsjuhos.supabase.co/functions/v1/ingest-cards \
  -H "Content-Type: application/json" \
  -d '{"page": 1}'
```

This fans out across all pages automatically. Monitor progress in Supabase Dashboard → Table Editor → `ingest_queue`. Takes ~10–15 minutes.

### 6 — Flip Vercel to Supabase

[Vercel Dashboard](https://vercel.com) → project → Settings → Environment Variables:

Change `VITE_API_URL`:
- **From:** `https://pokemon-tracker-production-bdc9.up.railway.app`
- **To:** `https://wmwpjkfgapqyyjsjuhos.supabase.co`

Redeploy. Once confirmed working, Railway can be shut down.

---

## Project Structure

```
pokemon-tracker/
├── supabase/
│   ├── config.toml
│   ├── migrations/          # Postgres schema
│   └── functions/
│       ├── _shared/         # CORS helpers, Supabase client
│       ├── collection/      # Collection CRUD
│       ├── cards/           # TCG API proxy + cache
│       ├── chat/            # AI RAG pipeline
│       ├── ingest-cards/    # Fan-out card embedding
│       └── ingest-check/    # Weekly incremental sync
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── ChatModal.tsx  # AI chat (voice + camera)
│   │   ├── pages/
│   │   ├── types/
│   │   └── utils/api.ts       # Supabase-pointed API client
│   └── vercel.json
├── scripts/
│   └── migrate-collection.ts  # SQLite → Supabase one-time import
└── .github/workflows/
    ├── supabase-deploy.yml    # Auto-deploy on push to main
    └── supabase-keepalive.yml # Ping every 3 days (free tier)
```

---

## Collection Codes

Each user's collection is identified by an 8-character code (e.g., `BRANTLEY`) stored in localStorage. Share the code to sync across devices. Append `?c=BRANTLEY` to any URL to switch collections.
