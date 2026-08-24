# Architecture

## The shape of the business, and why the software mirrors it

A matchmaking business has three relationships, and almost every design decision
here follows from keeping them separate:

- **the agency and its candidates** — a private database of real women who
  agreed to be considered, not a marketplace listing
- **the agency and its clients** — a paid, confidential engagement
- **a candidate and a client** — a *pairing*, which is where status, the "why
  she's a match" line, the matchmaker's candid note, and the client's answer all
  belong

The original prototype flattened the third into the first: status and notes sat
on the candidate record. That works for one client and breaks the moment there
are two, which is exactly why "copy candidates between clients" was still on the
outstanding list. Splitting `candidate` from `roster_item` makes that feature a
consequence of the model rather than a feature to build.

## Stack

| | | why |
|---|---|---|
| Next.js 16, App Router | UI + server actions | Server components mean the client portal is assembled on the server; the browser is handed a payload that contains no internal fields at all |
| Supabase (Postgres) | data, auth, storage | Row-level security lets confidentiality be a database property rather than a code convention |
| Stripe | subscriptions + Connect | Two revenue legs, kept as separate objects |
| Vercel | hosting | Edge-rendered, and a custom domain per agency is a platform-level config |

### Demo mode

With no Supabase keys, `getRepo()` returns a file-backed store seeded with the
real roster. It exists so the product can be shown to a matchmaker in thirty
seconds and so the end-to-end tests run in CI without a database. It does no
authorization; every rule that matters is in SQL.

## Tenancy

`agency` is the tenant. Every table carries `agency_id` or reaches it in one
hop. Two kinds of user reach the database with a session:

- a **matchmaker**, matched by `agency_member.auth_user_id = auth.uid()`
- a **client**, matched by `client.auth_user_id = auth.uid()`

Anyone who is neither sees nothing. That is the right default for a database of
profiles of people who did not sign up to be public.

## Confidentiality, structurally

Three mechanisms, in order of how much they'd have to fail together:

1. **Separate tables.** `roster_item_private` (the matchmaker's note) and
   `candidate_internal` (source, Instagram, consent flags) have no policy
   granting a client anything. There is no query a client session can write that
   returns those rows.
2. **A separate load path.** The portal calls `loadPortal()`, which builds a
   `PortalView` out of an explicit `PublicCandidate` type. Adding a field to
   `Candidate` cannot widen it, because the public shape is written out rather
   than derived with `Omit<>`.
3. **A test.** `tests/flow.mjs` writes a canary private note and asserts it
   appears in no portal response.

The client's own note runs the other way: `client_feedback` is writable by the
client and read-only to the agency, so a note attributed to the client is always
genuinely theirs.

## Scheduling

`booking_type` defines what can be booked (intake, introduction, check-in) with
a duration and an optional price. `availability_rule` holds each matchmaker's
weekly hours. A `booking` is proposed by the agency and confirmed by the client
in their portal.

The introduction case is the one specific to this business: it hangs off a
`roster_item`, so an introduction is always traceable to the pairing that
produced it, and "how many introductions did this client get this quarter" is a
query rather than a spreadsheet.

`calendar_connection` is the seam for two-way sync: a member connects Google
Calendar, refresh tokens go to Supabase Vault (the table holds only a pointer),
confirmed bookings become real invites, and busy times subtract from
availability. Not built yet.

## Photos

Stored as a URL plus a frame (`{x, y, zoom}`) rather than a cropped file, so
re-framing never destroys the original — this is what the prototype's
double-click-to-reframe interaction was already doing, made explicit.

In demo mode an uploaded photo is inlined as a data URL. In production it should
go to a Supabase Storage bucket (`candidate-photos`), private, served through
signed URLs, with the object path in `candidate.photo_url`. That swap touches
one function, `onPickPhoto` in `components/candidate-editor.tsx`.

Patrick's 18 candidate photos live as base64 in the old standalone export and
have not been migrated — see `docs/migration-notes.md`.

## Payments

Two legs, deliberately separate objects on separate accounts:

**Subscription** — the agency pays the platform. Three tiers in `lib/stripe.ts`.
Checkout carries `agency_id` in metadata; the webhook writes the result back.

**Connect** — the agency's clients pay the agency through the platform, and the
platform takes `application_fee_bps` (default 5%). Express accounts, so Stripe
holds the identity and payout details we have no reason to hold.

Keeping them separate means an agency that never enables Connect still has a
working product, and one that cancels its subscription doesn't strand money owed
to it.

The webhook is the only place billing state is written. It verifies the Stripe
signature, records every event id in `stripe_event` (so a redelivery is a no-op),
and runs under the service role because a webhook carries no user session.

## The network

See `docs/decisions.md`, ADR-003. Short version: other agencies never browse your
database. They search anonymized cards and ask you for an introduction; you
decide what to release, to whom, and it expires.

## What is not built yet

- Auth flows (magic-link invites for clients, agency sign-up). The schema and
  policies assume them; the screens don't exist.
- Calendar sync and availability-driven booking pages.
- Photo storage, and migrating Patrick's existing photos.
- Custom domains per agency.
- The client-facing payment surface (the Connect plumbing is there; nothing
  charges a client yet).
