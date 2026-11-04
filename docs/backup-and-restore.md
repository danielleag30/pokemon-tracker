# Backup & Restore

## What is backed up

`.github/workflows/supabase-backup.yml` runs nightly at 07:00 UTC and on demand.
It dumps five tables and uploads a **GPG-encrypted** artifact with 90-day retention.

| Table | Why |
|---|---|
| `collection` | The irreplaceable one — ~1,200 rows of hand-catalogued cards |
| `profiles` | 7 rows, includes `real_email` (parent addresses) |
| `chat_logs`, `chat_feedback`, `general_feedback` | Small, not regenerable |

**Deliberately excluded** — all regenerable, 134 MB of it:
`cards_vectors` (re-run the ingest pipeline), `card_cache` / `set_cards_cache` /
`sets_cache` (re-fetched from pokemontcg.io), `ingest_queue` (pipeline state).

The **schema** is not in the backup because it is already versioned in
`supabase/migrations/`. A full rebuild is `supabase db push` followed by the restore below.

## Why it's encrypted

This repo is public. On a public repo, **anyone can download workflow artifacts** —
they are not limited to collaborators. `profiles.real_email` holds parent email
addresses tied to `is_child` accounts, so the dump is encrypted with AES-256 before
it becomes an artifact.

The passphrase lives in the `BACKUP_PASSPHRASE` repo secret. **Keep a copy in a
password manager** — without it the backups are unreadable. If you lose it, rotate
the secret and the next nightly run produces a readable backup again; older
artifacts stay locked forever.

## Before you can restore: install two tools

Neither ships with macOS, and a restore drill on 2026-11-03 found both missing —
which meant the backups were technically unreadable on this machine. Install them
*now*, not during an incident:

```bash
brew install gnupg libpq
brew link --force libpq
```

`gpg` decrypts the artifact; `psql` loads it. `psql` must be reasonably current:
the dump contains `\restrict` / `\unrestrict` directives (introduced by the
pg_dump fix for CVE-2025-8714) that older versions will choke on.

## Restoring

```bash
# 1. Download the artifact from the Actions tab, then decrypt
gpg --decrypt --output restore.sql poketracker-TIMESTAMP.sql.gpg

# 2. Inspect before you touch anything
grep -c '' restore.sql
head -40 restore.sql
```

The dump is self-contained (`CREATE TABLE` + `COPY`), so into an empty database:

```bash
psql "$DATABASE_URL" -f restore.sql
```

Into a database where the tables still exist, restore one table rather than the
whole file — drop or truncate the target first, since `COPY` will not overwrite:

```bash
psql "$DATABASE_URL" -c 'truncate public.collection;'
psql "$DATABASE_URL" -c "\copy public.collection from program 'sed -n ''/^COPY public.collection /,/^\\\\\\.$/p'' restore.sql | tail -n +2 | head -n -1'"
```

Connection string (session pooler — the direct `db.*.supabase.co` host is IPv6-only
and will not resolve from most CI runners):

```
postgresql://postgres.wmwpjkfgapqyyjsjuhos:PASSWORD@aws-1-us-west-2.pooler.supabase.com:5432/postgres
```

## The guardrail

The workflow refuses to publish a backup if `collection` is empty, or if the row
count in the dump does not match the live table. A silently-empty backup that looks
green on the Actions tab is worse than no backup at all, so the job fails loudly instead.

Verified end-to-end on 2026-11-03 (run 41714545591): guard reported
`live rows: 1216 / rows in dump: 1216`; the 18 KB artifact decrypted to 151 KB of
SQL containing all 5 tables, 5 primary keys, 5 foreign keys, 4 indexes, and 9 RLS
policies — matching the live schema exactly.

## Known limits

- **90-day retention.** Artifacts expire. This protects against accidental deletion
  and bad migrations, not against needing a two-year-old snapshot. For longer
  retention, download one periodically or push to off-GitHub storage.
- **Not a Supabase-side backup.** If the Supabase project itself were deleted, these
  artifacts are what you have. That is the intent — they live somewhere else.
- **Free tier has no PITR.** Supabase Pro ($25/mo) adds daily backups and
  point-in-time recovery, and would also let you delete `supabase-keepalive.yml`.
