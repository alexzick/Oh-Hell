# Data model

Full DDL: `supabase/migrations/0001_schema.sql`. Policies: `0002_rls.sql`. This
page explains why fields sit where they do.

```
agency ─┬─ agency_member          staff, joined to auth.users
        ├─ client ─┬─ client_city      per-client, editable city tabs
        │          └─ roster ── roster_item ─┬─ roster_item_private   MATCHMAKER ONLY
        │                                    └─ client_feedback       CLIENT WRITES
        ├─ candidate ── candidate_internal   MATCHMAKER ONLY
        ├─ booking_type, availability_rule, booking, calendar_connection
        ├─ payment, (stripe_event)
        └─ network_profile ── referral_request ── referral_release
```

## Where each field lives, and why

| | on `candidate` | on `roster_item` |
|---|---|---|
| name, age, based in, profession, faith | ✔ true about her | |
| `about` — her introduction | ✔ same text for anyone | |
| photo + frame | ✔ | |
| `status` (strong fit / maybe / hold / passed) | | ✔ about a pairing |
| `blurb` — "why she's a match" | | ✔ written for one client |
| private note | | ✔ in `roster_item_private` |
| city grouping | | ✔ tabs belong to the client |

The rule: if the answer changes depending on which client is asking, it is not a
property of the person.

## The private tables

`roster_item_private` and `candidate_internal` exist so that "a client may read
a candidate on their roster" never has to be written as a column filter. No
policy in `0002_rls.sql` grants a client anything on either. See ADR-002.

`client_feedback` is the mirror image: the client has full read/write on their
own rows, the agency has select only. A note attributed to the client is
therefore always genuinely theirs — the matchmaker cannot write one on their
behalf.

## Two vocabularies, on purpose

`match_status` is the matchmaker's judgment (`yes` / `maybe` / `hold` /
`passed`). `client_reaction` is the client's answer (`interested` / `curious` /
`pass`). They are different columns in different tables because they are
different opinions, and collapsing them would lose the disagreement that is the
most interesting signal a matchmaker gets.

## Rosters

A client can have several. Round one goes out, the client responds, round two is
assembled as a fresh draft without disturbing the first. `roster.status` is
`draft` until shared; `client_can_read_roster()` requires `shared`, so a
half-assembled roster is invisible in the portal.

## Cities

Per client, ordered, editable — they are how a client thinks about their own
roster, not a global taxonomy. The prototype's rule that a candidate's free-text
"Based in" re-derives her city tab is preserved when copying between clients:
her `based_in` is matched against the target client's tabs, and if nothing
matches she is left ungrouped rather than guessed at.

Note that the original data had drifted here — city key `la` was labelled
"Miami" and `aspen` was labelled "Los Angeles". The seed script treats labels as
authoritative and re-derives keys.

## Consent

`candidate_internal.consent_version` / `consent_at` record which consent text
she agreed to and when. `candidate_internal_consent_guard` refuses any row with
`network_listed = true` and no consent recorded, so the constraint holds for
imports and scripts, not just the UI.
