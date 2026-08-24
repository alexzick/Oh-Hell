# Setup — Unicorn Club, live

The live project is provisioned and seeded. This records what exists and what
is left to do.

## The project

| | |
|---|---|
| Supabase project | `unicorn-club` (`ujuddtskztldeegvdgnn`), org `Zick`, region `us-east-2` |
| API URL | `https://ujuddtskztldeegvdgnn.supabase.co` |
| Migrations applied | `0001_schema`, `0002_rls`, `0003_debrief`, `0004_auth_binding` |
| Seeded | 1 agency, 2 owners (Emily, Alex), 1 client (Patrick), 19 candidates, 19 roster items, 3 private notes, 3 booking types |
| Roster state | **draft** — nothing is visible to Patrick until Emily shares it |

## The confidentiality model, verified against the live database

Every table in `public` has row-level security enabled. Sessions were then
simulated inside a transaction that was rolled back, by binding a fake
`auth_user_id` and setting `request.jwt.claims`, so these are the real policies
answering real queries rather than an argument about what they should do:

| Who is asking | candidates | roster items | private notes | internal rows |
|---|---|---|---|---|
| Anonymous — anyone with the publishable key | 0 | 0 | 0 | 0 |
| Emily, signed in as a matchmaker | 19 | 19 | **3** | **19** |
| Patrick, signed in, roster still a draft | 0 | 0 | 0 | 0 |
| Patrick, signed in, roster shared | 19 | 19 | **0** | **0** |

The last row is the one the product turns on. Patrick can see every candidate on
his roster and cannot reach a single private note or internal field — not
because a query filtered them out, but because no policy on those tables admits
him. The row above it is the draft guarantee: nothing at all until Emily shares.

To re-run this after changing any policy, see the transaction pattern in
`docs/decisions.md` ADR-002 — bind a fake auth user, `set local role
authenticated`, set the JWT claim, count, then `rollback`.

## Running against it

Create `.env.local` (git-ignored):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ujuddtskztldeegvdgnn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from the Supabase dashboard: Settings → API>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

The anon key is designed to be public — it ships in the browser bundle — but it
is not committed here, because a key in a repo outlives the repo.

With those set the app leaves demo mode automatically and every query runs under
the signed-in user's policies. Without them it stays on the bundled fixture, so
`npm run test:flow` keeps working with no database.

## How signing in works

Magic link only, no passwords. A person's row exists *first*, with their email
on it; completing the link proves they own that inbox, and a trigger binds the
auth user to the waiting row (`0004_auth_binding.sql`). Nobody self-registers
into an agency.

Someone who signs in and matches no row lands on a page telling them to ask
their matchmaker. They can see nothing, which is the correct outcome and lets
the sign-in form give the same answer to every address — so it cannot be used to
find out who is a client of the agency.

## Left to do

1. **First sign-in.** Two owner rows exist and are waiting to be claimed:
   Emily (`emsterp@gmail.com`) and Alex (`anzick@gmail.com`). Neither has
   signed in yet. Requesting a link at `/signin` binds the account to the row.

2. **Email delivery.** Supabase's built-in SMTP is rate-limited and lands in
   spam often enough to matter. Before Patrick ever gets a link, point
   Auth → SMTP at a real sender (Resend, Postmark) on Emily's domain.

3. **Redirect URLs.** Auth → URL Configuration needs the deployed origin plus
   `http://localhost:3000/auth/callback`, or magic links will refuse to return.

4. **Photos.** No candidate has one. The originals are base64 inside
   `Pat's Roster (standalone, with photos).html`, which has not been handed over
   — see `docs/migration-notes.md`.

5. **Patrick's invite.** Deliberately not sent. His roster is a draft and he has
   no `client.email`; Emily shares when she's ready.

## A note on this sandbox

Outbound HTTPS to `supabase.co` is blocked from the environment these changes
were written in, so the live path has not been exercised end to end from here —
only the schema, the policies and the seeded data were verified, in-database.
The first real sign-in is the thing still to confirm.
