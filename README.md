# PokéTracker

<p align="center">
  <img src="docs/hero-banner.png" alt="PokéTracker — a Pokéball spilling open onto a grid of indexed trading cards" width="700">
</p>


I have a real Pokémon TCG collection, a kid who plays with me, and a spreadsheet that stopped scaling about two thousand cards ago. PokéTracker is what I built instead — a full-stack collection tracker with an AI chat assistant, running on Supabase Edge Functions and a React frontend, that we actually use to figure out what's missing from Base Set and which binder a given Charizard lives in.

It started as a quick Express + SQLite prototype on Railway (still in `backend/`, kept for the git history — it's dead code now, fully superseded). The version that's actually deployed is the one described below: Supabase Postgres with pgvector, Deno edge functions, and a proper auth system built for an account a 10-year-old can log into without an email address.

---

## What it does

- **10 ways to browse a collection** — Dashboard, My Cards, Pokédex, By Set, By Series, By Starter, By Type, By Evolution Stage, Missing Cards, Duplicates
- **An AI chat assistant with a real RAG pipeline** — ask "what fire type cards do I own?" or "which sets am I closest to completing?" in plain English, backed by semantic search over an indexed corpus of the Pokémon TCG API's full card catalog (13k+ cards and growing)
- **Voice input** — Web Speech API wired directly into the chat box
- **Camera capture** *(experimental)* — snaps a photo and attaches it to a chat message; honest caveat: the LLM behind it is text-only, so this is currently more "attach a picture" than "identify this card from a photo"
- **Batch add mode** — browse a whole set, series, or type and check off owned cards in bulk
- **Foil tier tracking** — Normal, Reverse Holo, Holofoil, 1st Edition Normal, and 1st Edition Holofoil, tracked per card
- **Set completion tracking** — progress bars and missing-card lists per set, with a chat-driven "which sets am I closest to finishing?" view across the whole collection
- **PIN-based accounts built for kids** — no email required to log in, COPPA-compliant by design (see below)
- **Admin dashboard** — LLM usage metrics, latency/token stats, full chat log, intent-frequency breakdown, feedback review, user management
- **JSON export** — full collection backup, one click

*(A JSON import endpoint exists server-side and was used for the original data migration, but there's no import button in the UI yet — noted as a next step, not a claimed feature.)*

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite, deployed on Vercel |
| Backend | Supabase Edge Functions (Deno/TypeScript) |
| Database | Supabase Postgres + pgvector, HNSW cosine index |
| AI / LLM | Ollama Cloud (`gemma4:31b-cloud`, OpenAI-compatible API) |
| Embeddings | `gte-small` via Supabase AI (384 dimensions) |
| Auth | Supabase Auth, wrapped in a username + PIN flow (details below) |
| Transactional email | SendGrid (account confirmation, PIN reset) |
| Card data | [Pokémon TCG API](https://pokemontcg.io) |
| CI/CD | GitHub Actions → Supabase auto-deploy (5 of 6 functions; see caveat below) |

---

## The part I'm proudest of: PIN auth for a kid who doesn't have an email

The user base for this app is exactly one Pokémon-obsessed child, and I wasn't going to ask a 10-year-old to manage an email address and a password. So the auth flow does something a little unusual:

1. On registration, the child (or I, as the parent) picks a **username** and a **6-digit PIN**. A parent email is required, but it's never shown to the app or used to log in.
2. The edge function maps the username to a synthetic internal email (`username@pokemontracker.app`) and calls Supabase's admin API to create a real auth user with the PIN as the password.
3. Login exchanges username + PIN for that synthetic email + password via `signInWithPassword`, which hands back a genuine Supabase session JWT — so from that point on, everything (RLS policies, edge function auth checks) works exactly like normal Supabase Auth. The synthetic-email trick is purely a translation layer at the door.
4. Forgot your PIN? Supabase's own `generateLink` recovery flow issues a signed reset link, delivered by email (to the parent, for child accounts) via SendGrid.

It's paired with a real `/privacy` page that spells out COPPA compliance in plain language: parent-provided email only, no PII collected from the child, no ads, no third-party tracking, and a stated 30-day window to review/delete data on request.

---

## How the AI Chat Works (RAG Pipeline)

