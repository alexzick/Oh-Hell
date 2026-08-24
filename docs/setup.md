# Setup — Unicorn Club, live

The live project is provisioned and seeded. This records what exists and what
is left to do.

## The project

| | |
|---|---|
| Supabase project | `unicorn-club` (`ujuddtskztldeegvdgnn`), org `Zick`, region `us-east-2` |
| API URL | `https://ujuddtskztldeegvdgnn.supabase.co` |
| Migrations applied | `0001_schema`, `0002_rls`, `0003_debrief`, `0004_auth_binding` |
| Seeded | 1 agency, 1 client (Patrick), 19 candidates, 19 roster items, 3 private notes, 3 booking types |
| Roster state | **draft** — nothing is visible to Patrick until Emily shares it |

Verified after seeding: every table in `public` has row-level security enabled,
and the `anon` role — which is what anyone holding the publishable key is —
reads zero rows from `candidate`, `roster_item`, `roster_item_private`,
`candidate_internal`, `client` and `agency`.

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

1. **Emily's account.** `agency_member` is empty, so nobody can see anything
   yet. It needs one row with her real email:

   ```sql
   insert into agency_member (agency_id, name, email, role)
   values ('895283e1-7886-5868-89d0-b31a8b0dd695', 'Emily', '<her email>', 'owner');
   ```

   Then she requests a link at `/signin` and she's in.

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
