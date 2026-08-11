# Secrets

All secrets are stored as Supabase Edge Function secrets (`supabase secrets set`), not `.env` files. `.gitignore` excludes `.env*`; no `.env` files exist under `supabase/functions/*`. No secret value is ever logged, printed in an edge function response body, or referenced in frontend code — frontend only ever talks to edge functions, which hold the service-role key server-side.

Verified via `supabase secrets list` on `wmwpjkfgapqyyjsjuhos` (2026-08-11) — names only, no values below.

## In use, set

| Secret | Used in | Purpose |
|---|---|---|
| `SUPABASE_URL` | `_shared/supabase.ts`, `ingest-cards`, `ingest-check` | Project API URL, and self-invoke target for chained functions |
| `SUPABASE_SERVICE_ROLE_KEY` | `_shared/supabase.ts` (`makeClient`), `ingest-cards`, `ingest-check` | Bypasses RLS — service-role client used for all admin writes and self-invoke auth |
| `SUPABASE_ANON_KEY` | `_shared/supabase.ts` (`makeAnonClient`, `makeUserClient`) | Anon/user-scoped clients — RLS applies |
| `POKEMON_TCG_API_KEY` | `_shared/supabase.ts` (`tcgHeaders`) | Upstream pokemontcg.io API auth header |
| `OLLAMA_CLOUD_URL` / `OLLAMA_CLOUD_TOKEN` / `OLLAMA_CLOUD_MODEL` | `chat/index.ts` | RAG chat LLM backend |

## In use, optional (safe default if unset)

| Secret | Used in | Default if unset |
|---|---|---|
| `ALLOWED_ORIGIN` | `_shared/cors.ts` | `'*'` — currently unset, so CORS is wide open. Out of scope for this build plan; flagged for a future hardening pass. |
| `CHAT_RESULT_CAP` | `chat/index.ts` | Falls through `??` to a code-level default |

## Referenced in code, NOT set (known gap, pre-existing)

| Secret | Used in | Effect while unset |
|---|---|---|
| `SENDGRID_API_KEY` / `SENDGRID_FROM_EMAIL` | `auth/index.ts` | Registration/PIN-reset emails silently don't send (guarded by `if (sgKey)` — no crash, no user-facing error). Pre-existing gap from the Resend→SendGrid migration, unrelated to this build plan. |

## Set but unused

| Secret | Note |
|---|---|
| `RESEND_API_KEY` | Legacy — superseded by the SendGrid switch. Safe to remove once SendGrid is confirmed working. |

## Platform-reserved (not read directly by our code)

`SUPABASE_DB_URL`, `SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS` — auto-managed by the Supabase platform.

## New secret surface from the data-layer build plan (Phases 0–3)

**None required.** TCGdex's public API is expected to be keyless; this is being verified directly (not assumed) as the first step of task 3-2, before any TCGdex integration work proceeds.
