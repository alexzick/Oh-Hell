# Decisions

Records of choices that were not obvious, so the reasoning survives the session
they were made in.

---

## ADR-001 — Relationship data lives on the pairing, not the person

**Context.** The prototype kept `status`, `blurb` and `note` on the candidate
record. With one client that reads naturally. With two, "Maybe" becomes
ambiguous — maybe for whom?

**Decision.** `candidate` holds facts that are true regardless of who is
looking. `roster_item` holds the pairing: status, the "why she's a match" line,
the private note, position, city grouping.

**Consequences.** Copying a candidate to a second client's roster is a single
insert that naturally starts blank; her bio comes with her, the first
relationship does not. This was an outstanding feature request; it became a
property of the model instead. The cost is one join on every roster read, which
at tens of rows per roster is not a cost.

---

## ADR-002 — Confidentiality by table separation, not by column filtering

**Context.** The single rule the original tool could not afford to get wrong:
the matchmaker's candid note must never reach the client. Enforcing that with
`select` column lists means every future query is a chance to break it.

**Decision.** Private fields live in tables the client role has no policy on:
`roster_item_private` for the matchmaker's note, `candidate_internal` for
source, Instagram handle and consent flags. The portal loads through a separate
function returning an explicitly-written public type.

**Consequences.** A leak requires someone to write a *new policy* on a private
table, which is a conspicuous act, rather than to forget a column in a select.
Postgres column-level grants were considered and rejected: grants are per-role,
and matchmakers and clients are both `authenticated`, so a column grant that hid
the note from clients would hide it from matchmakers too.

---

## ADR-003 — The network is referral requests, not a shared pool

**Context.** The network-effects goal: matchmakers plug into each other's
databases, so a client in New York can be matched with someone another agency
knows in Miami. The obvious implementation — a shared searchable pool — moves
profiles of real women, who signed up with one matchmaker, into the hands of
agencies they have never heard of. That is a consent problem and a liability
problem before it is a product problem.

**Decision.** Three layers:

1. **Consent gate.** A candidate can be listed only if a consent record exists
   against her profile. Enforced by a database trigger
   (`candidate_internal_consent_guard`), not by the UI, so it holds for imports
   and scripts too.
2. **Anonymized index.** What other agencies search is `network_profile`: age
   band, metro, profession category, faith, relocation openness, and a one-line
   headline written by the owning matchmaker. No name, no photo, no handles, no
   free text that would identify her. The matchmaker sees this projection of
   her own listings on the Network screen, so the anonymization is inspectable
   rather than promised.
3. **Scoped, expiring release.** An interested agency sends a
   `referral_request` with an anonymized brief about *their* client. The owning
   agency releases or declines. A release creates a `referral_release` naming
   the fields, the recipient agency, and an expiry — and that row is the only
   thing that grants cross-agency read access to the real candidate
   (`has_referral_access()` in the RLS policies).

**Consequences.** Slower network effects than an open pool, and it needs the
request/response loop to be pleasant or matchmakers will fall back to texting
each other. In exchange: the network is defensible to a candidate who asks
"who can see me?", the answer is specific, and the audit trail exists. If the
open-pool model is wanted later it is a policy change on top of this, not a
rewrite — but it should be a deliberate decision with consent language written
by a lawyer, not a default.

---

## ADR-004 — Both Stripe legs from day one, subscription first

**Context.** Two plausible business models: charge matchmakers for the software,
or take a cut of what their clients pay them.

**Decision.** Model both. `agency.stripe_customer_id` / `stripe_subscription_id`
for the platform subscription; `agency.stripe_connect_account_id` and
`application_fee_bps` for client payments through Connect. Ship the subscription
first because it works without the agency doing KYC; Connect follows.

**Consequences.** Two Stripe integrations to maintain. The upside is that
neither depends on the other: an agency that never enables Connect still has a
working product, and one that cancels its subscription does not strand money
owed to it. Both are mirrored from Stripe by one webhook that verifies
signatures and dedupes on event id.

---

## ADR-005 — Demo mode is a development fixture, not a second product

**Context.** The app should be showable to a matchmaker with no setup, and the
end-to-end tests should not need a database.

**Decision.** A file-backed repository behind the same interface as the Supabase
one, selected purely by whether Supabase env vars exist.

**Consequences.** Two implementations to keep in step, which is a real cost.
Mitigated by keeping the interface small (one `loadWorkspace`, one `loadPortal`,
and a set of narrow mutations) and by the demo adapter carrying no authorization
logic at all — it mirrors the *shape* the policies return, never the rules. Do
not let business rules accumulate in it.

---

## ADR-006 — All statuses stay visible to the client

**Context.** The prototype originally showed clients only `yes` and `maybe`.
Patrick asked to see who had been ruled out, so `passed` became visible at 50%
opacity.

**Decision.** Keep it. Client visibility is a per-agency preference, not a law.

**Consequences.** It should become a brand/settings toggle before the second
tenant, since not every matchmaker will want a client seeing "Passed" against a
real person's photo. Filed, not built.

---

## ADR-007 — Post-date intelligence: prose is the record, structure is derived

**Context.** After an introduction there is intelligence worth capturing, and it
arrives as three or four hurried sentences. A form would collect the checkboxes
and lose the sentences, and the sentences are where the value is. But
unstructured text alone can't be queried, compared or learned from.

**Decision.** `debrief.body` is written by a person and never rewritten by the
system. Structure is derived from it into `debrief_claim` — facet, dimension,
valence — and is not committed until a human accepts it. Claims are disposable
and recomputable; the prose is not.

One structured field is demanded at capture time: `disposition`
(`continue` / `decline` / `unsure` / `no_contact`). It is the training label for
everything else and it costs one tap.

Three further rules, all cheap now and unrecoverable later:

1. **Two accounts, not one.** Every introduction has a client's account and a
   candidate's. The disagreement between them is the highest-value signal the
   business produces, and it is only computable if both exist. Capturing only
   the client's side builds something that learns one person's taste and treats
   the other as inventory.
2. **Every claim carries provenance, subject, confidence and span.** `voice`
   records whose account it is; `author_kind` records who typed it. Candidates
   have no accounts yet, so hers is `relayed` — and a system that cannot tell
   "she said this" from "we think this" will eventually tell a client the wrong
   one.
3. **Safety is not a facet.** `safety_report` is a separate table with separate
   policies and no path into ranking. "She wasn't into him" and "he wouldn't let
   her leave" must not travel down the same pipe.

**Consequences.** Extraction is deliberately not built yet — the ontology in
`docs/ontology.md` is a hypothesis, and the right time to fix it is after fifty
real debriefs have been read, not before the first. Until then the app collects
prose and one enum, which is enough to be useful on its own and is what every
later model will train on.

Two things to settle before this goes live: how long a conduct or chemistry
claim about a person should live before it ages out or collapses into an
aggregate, and the legal posture of opinions held *about* someone — a debrief is
written by one person about another who never agreed to it, which is a different
situation from the notes already in the system.
