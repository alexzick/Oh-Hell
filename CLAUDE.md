# Working on this repository

A white-label platform for matchmaking businesses. Unicorn Club (matchmaker:
Emily) is the first tenant; Patrick is their first client.

Read `docs/decisions.md` before changing anything structural — it records why
the model looks the way it does, and most "obvious" simplifications have already
been considered and rejected there for a reason.

## Run it

```bash
npm install && npm run dev     # http://localhost:3000, no configuration needed
```

With no Supabase keys the app runs in **demo mode** against a file-backed store
(`.data/demo.json`, seeded from `data/seed-unicorn-club.json`). Add the keys from
`.env.example` and the same code runs against Postgres.

- `/app` — matchmaker workspace
- `/portal/{clientId}` — client portal

## Verify before pushing

```bash
npm run typecheck
npm run build
rm -rf .data && npm start -- -p 3100 &   # must be a fresh build on a clean store
npm run test:flow                         # 28 assertions
```

`tests/flow.mjs` is the real safety net. It drives a production build with
Playwright and asserts the two rules the product cannot get wrong. If a change
touches the portal, the repo layer or RLS, it must still pass.

Gotcha: the demo store caches state in the module, so deleting `.data/` while a
server is running does nothing — restart the server. Kill it with
`pkill -f "[n]ext-server"` (the bracket stops pkill matching its own command).

## The rules the code is built around

1. **A private note never reaches a client.** Not by filtering — private fields
   live in tables (`roster_item_private`, `candidate_internal`) that no client
   role has a policy on, and the portal loads through `loadPortal()`, which
   assembles a view with no field to put them in. Never add a client policy to
   those tables. Never widen `PublicCandidate` without deciding to.
2. **Relationship data lives on the pairing.** Status, the match line and the
   private note are on `roster_item`, not `candidate`. This is what makes
   copy-to-another-client correct by construction (ADR-001).
3. **Both accounts of a date, and who is speaking.** `debrief.voice` is whose
   account it is; `author_kind` is who typed it. Candidates have no logins yet,
   so hers is `relayed`, not `stated` (ADR-007).
4. **Safety is not a facet.** `safety_report` is a separate table with no path
   into ranking.

## Layout

| Path | |
|---|---|
| `app/app/**` | Matchmaker workspace |
| `app/portal/**` | Client portal — treat as a separate world, share no components with the workspace |
| `lib/db/` | One repo interface, two adapters: `demo.ts` (dev fixture) and `supabase-repo.ts` |
| `lib/types.ts` | Domain types. `PublicCandidate` is written out longhand on purpose |
| `supabase/migrations/` | Schema and RLS. Authorization lives here, not in the app |
| `docs/` | Architecture, data model, decision records, migration notes |

The demo adapter mirrors the *shape* the SQL policies return and carries no
authorization logic. Don't let business rules accumulate in it.

## Conventions

- Styling is plain CSS with custom properties in `app/globals.css`. Brand-facing
  tokens are written onto `:root` at runtime from the agency's `brand` JSON, so
  a new tenant restyles without a deploy. No CSS framework; don't add one.
- Server Components load data; Client Components own interaction. Mutations go
  through server actions in `lib/actions.ts`, which stay thin — rules belong in
  the repo or in SQL.
- Text fields autosave (`lib/use-autosave.ts`). There is no Save button, because
  the tool this replaces had none.
- Regenerate seeds rather than editing them:
  `python3 scripts/build-seed.py <candidates.json> > data/seed-unicorn-club.json`
  then `python3 scripts/build-seed-sql.py > supabase/seed.sql`.

## Real data

`data/seed-unicorn-club.json` and `supabase/seed.sql` contain 19 real women's
names, ages, professions and Emily's private notes about them. The repository
stays private. Do not paste this content into anything public, and do not add it
to test fixtures.

See `docs/migration-notes.md` for what came across from the original prototype
and what did not — notably the photos, which are still outstanding.
