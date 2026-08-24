# Matchmaking platform

A white-label platform for matchmaking businesses: matchmakers curate a roster of
candidates for each client, share it as a branded private portal, and the client
responds — selecting who they'd like to meet and leaving notes. Around that sit
scheduling, payments, and an opt-in referral network between agencies.

Unicorn Club is the first tenant. Their existing single-file prototype
(`Candidate Roster Builder.dc.html`) is the design reference; this repository is
that design rebuilt as a real multi-tenant application, with Patrick's actual
19-candidate roster carried over as seed data.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

No configuration needed. With no Supabase keys present the app runs in **demo
mode** against a file-backed store seeded from `data/seed-unicorn-club.json`, so
you get the real roster immediately. Add the keys from `.env.example` and the
same code runs against Postgres.

- `/app` — the matchmaker's workspace
- `/portal/{clientId}` — what the client sees

## What's here

| Path | |
|---|---|
| `app/app/**` | Matchmaker workspace: roster, candidate editor, schedule, network, billing, settings |
| `app/portal/**` | Client portal: roster, profile, reactions, notes |
| `app/api/stripe/**` | Subscription checkout, Connect onboarding, webhook |
| `supabase/migrations/0001_schema.sql` | Tables |
| `supabase/migrations/0002_rls.sql` | Row-level security — where the confidentiality rules actually live |
| `supabase/seed.sql` | The Unicorn Club tenant + Patrick's roster |
| `lib/db/` | One repository interface, two adapters (demo file store, Supabase) |
| `docs/` | Architecture, data model, and the decisions worth arguing about |
| `tests/flow.mjs` | End-to-end walk of the confidentiality and copy-between-clients rules |

## The two rules the code is built around

**A private note never reaches a client.** It is not filtered out in a
component — it lives in `roster_item_private`, a table no client role has any
policy on, and the portal loads through `loadPortal()`, which assembles a view
that has no field to put it in. `tests/flow.mjs` writes a canary note and
asserts it appears nowhere in the portal's HTML.

**Status, match note and private note describe a pairing, not a person.** They
live on `roster_item`, not `candidate`. That is what makes "copy her to another
client's roster" correct by construction: the new pairing starts blank while her
own bio comes with her.

## Verify

```bash
npm run build
rm -rf .data && npm start -- -p 3100 &
npm run test:flow          # 19 assertions
```

## Setting up Supabase

1. Create a project, then run `supabase/migrations/0001_schema.sql`,
   `0002_rls.sql` and `seed.sql` in the SQL editor, in that order.
2. Copy the URL and anon key into `.env.local` (see `.env.example`).
3. Enable email auth. A matchmaker signs in and is matched to their
   `agency_member` row by `auth_user_id`; a client by their `client` row.

Regenerate the seed after editing the source data:

```bash
python3 scripts/build-seed.py path/to/candidates.json > data/seed-unicorn-club.json
python3 scripts/build-seed-sql.py > supabase/seed.sql
```
