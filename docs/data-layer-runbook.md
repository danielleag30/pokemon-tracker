# Data Layer Runbook

Operational notes for the card catalog and pricing pipeline, written after the
August 2026 rebuild. The non-obvious parts are recorded here because several
of them cost hours to rediscover.

## The two data sources

| Source | Role | Notes |
|---|---|---|
| `pokemontcg.io` | Primary. 174 sets. | Flaky — measured at 20–50% 5xx during the rebuild. Has **no** Mega Evolution Black Star Promos and no promo set newer than `svp` (2023). |
| `tcgdex.net` | Secondary, for sets the primary lacks. | Currently only `mep` (Mega Evolution Black Star Promos, 60 cards). Listed in `TCGDEX_ONLY_SET_IDS` in `_shared/tcgdex.ts`. |

`cards_vectors.data_source` records which one produced each row. Rows that
aren't `'pokemontcg'` are **never** overwritten by the normal ingest — TCGdex
is the only source for those cards, so a clobber would be unrecoverable.

## Hard constraints worth knowing

**Supabase meters Edge Function CPU per *worker isolate*, not per request.**
The isolate is reused across a self-invoke chain, so embedding cost
accumulates until the worker trips. A worker retires gracefully past 50% of
the 2s budget, but a request that carries it from just under 50% to over 100%
is hard-killed — no `catch` runs, no continuation fires, and the claimed row
is stranded in `processing`. This is why `CHUNK_SIZE` is 3 and not larger.
These limits are **identical on free and paid plans** (only wall clock
differs: 150s vs 400s), so upgrading does not help here.

**PostgREST caps unpaginated selects at 1000 rows.** A plain
`.select('set_id')` over `cards_vectors` silently returns 1000 of 20,000+.
Anything counting across the whole table must aggregate server-side — see
`ingest_coverage_by_set()`.

**Default privileges don't cover functions created by `supabase db push`.**
Objects land under `supabase_admin`'s default ACL, which still grants
`anon`/`authenticated` EXECUTE, and that role's defaults can't be altered
at this permission level. **Every new function needs an explicit
`REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`** in the same migration.

**`CREATE OR REPLACE FUNCTION` cannot widen a `RETURNS TABLE` signature.**
Drop and recreate inside the migration transaction.

## How the ingest works

`ingest_queue` holds one row per set. `claim_next_ingest_set()` atomically
claims the next `pending`/`error`/stale-`processing` row
(`FOR UPDATE SKIP LOCKED`) and flips it to `processing`.

`ingest-cards` processes one chunk per invocation:
1. Source is chosen **once per set** — cached (`set_cards_cache`) or upstream —
   and never switched mid-set. The two orderings differ (cache is in
   upstream's default order; the API path uses lexicographic `orderBy=id`), so
   switching at offset N would read a different slice and permanently skip
   cards. A cache probe failure hard-fails the chunk rather than silently
   falling back.
2. Cached sets scan a 60-card window and skip already-embedded cards in bulk
   (skipping costs a SELECT, not CPU); embedding is still capped at 3.
3. Offset advances only past what was definitively handled.
4. Any post-claim failure marks the row `error` and moves on.

`attempts` is a **consecutive**-failure counter: it increments at claim time
(so a hard CPU kill still counts, since no application code runs) and resets
to 0 on any forward progress.

### Why pg_cron drives it

The self-invoke chain dies routinely from worker recycling. The lease reclaim
was meant to recover stranded rows, but reclaim only runs *inside* an
invocation — so a dead chain had nothing to trigger its own recovery. That
circularity is why the original May 2026 ingest died at page 1,401 of 2,046
and stayed dead for three months.

`cron.job` `ingest-cards-driver` fires 10 nudges/minute from Postgres, which
cannot die with a worker. It is self-limiting: with everything `done` there is
nothing claimable and each run is a trivial query. Leave it scheduled so new
sets are picked up automatically.

## Common operations

```sql
-- Coverage: is anything missing?
select status, count(*), sum(ingested_count) from ingest_queue group by status;
select count(*) from cards_vectors;              -- target = sum of upstream totals

-- Which sets are short, and why?
select id, status, ingested_count, upstream_total, attempts, last_error
from ingest_queue where status <> 'done' order by attempts desc, id;

-- Restart a stalled/failed set from scratch
update ingest_queue
set status='pending', attempts=0, ingested_count=0, last_error=null, updated_at=now()
where id = '<set_id>';
```

`GET /functions/v1/ingest-check` reports `{set_id, ingested_count,
upstream_total, gap}` for every mismatched set; `POST` also re-queues genuine
shortfalls. A **negative** gap is normal on a few sets (`sve`, `svp`, `sm10`,
`sm11`, `smp`) where the API returns more cards than the set's declared
`total` — the check deliberately ignores those.

### Adding a new TCGdex-only set

1. Add its id to `TCGDEX_ONLY_SET_IDS` in `_shared/tcgdex.ts`, redeploy.
2. `POST /functions/v1/tcgdex-seed {"setId": "<id>"}` — normalizes the set
   into `set_cards_cache` and queues it. The ingest driver picks it up, and
   `/cards/sets` merges it into the set list on read.

## Pricing

`refresh-prices` walks all cards ~250 at a time and refreshes `raw_data`
pricing plus `prices_updated_at`. Two triggers: the GitHub Actions workflow
(Tue/Fri) and pg_cron `weekly-price-refresh` (Tue 04:00 UTC).

It previously **never completed**: no retry meant one upstream 5xx aborted all
~82 pages, and against a 20–50% error rate it could never finish. It now
retries with jitter and skips a bad page rather than aborting. My Cards shows
"Prices as of \<date\>" so a silent failure is visible.

`me2pt5` and `me3` (419 cards) have **no pricing at all** from the primary
source. They were backfilled from TCGdex by `tcgdex-backfill-prices`, which
maps ids by number and requires the card names to match before writing.

Note TCGdex fills holo-specific price keys with a literal `0` rather than
omitting them, so `0` must be treated as "no figure" — otherwise it shadows a
real price and cards display as free.

## Known open items

- **`refresh-prices` is publicly invokable** (`verify_jwt: false`,
  pre-existing) and the pg_cron job calls it unauthenticated. Hardening needs
  a service-role key in Vault, then flipping `verify_jwt` and updating the job.
- **`SUPABASE_SERVICE_ROLE_KEY` is not set in GitHub secrets**, so the Actions
  workflow runs unauthenticated (works only because of the above). Its
  failure-notification step also silently no-ops — `SENDGRID_API_KEY` is unset.
- **`ALLOWED_ORIGIN` is unset**, so CORS is `*`.
- **`set_cards_cache` and `cards_vectors` are still independent** (build-plan
  task 2-4, deferred). Post-ingest they agree, but nothing enforces it.
