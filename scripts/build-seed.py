#!/usr/bin/env python3
"""
Turn the original Candidate Roster Builder export (candidates.json) into a seed
in the platform's shape, splitting each old record across the three tables the
new model uses:

  candidate            facts about her        (name, age, based in, about, ...)
  candidate_internal   agency-only            (instagram, source)
  roster_item          the pairing w/ client  (status, blurb, private note)

Run:  python3 scripts/build-seed.py <candidates.json> > data/seed-unicorn-club.json
IDs are UUIDv5 so re-running produces byte-identical output.
"""
import json, sys, uuid, re

NS = uuid.UUID("6f1d2a54-9c3b-5f8e-b0a7-1c2d3e4f5a6b")
def uid(*parts): return str(uuid.uuid5(NS, "|".join(parts)))
def slug(s): return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))

src = json.load(open(sys.argv[1]))
old = src["clients"][0]

agency_id = uid("agency", "unicorn-club")
client_id = uid("client", agency_id, old["name"])
roster_id = uid("roster", client_id, "initial")

# The original file's city keys had drifted from their labels ("la" -> "Miami").
# Labels are what the matchmaker actually sees, so they win; keys are re-derived.
cities, city_by_oldkey = [], {}
for i, c in enumerate(old["cities"]):
    cid = uid("city", client_id, c["label"])
    cities.append({"id": cid, "clientId": client_id, "key": slug(c["label"]),
                   "label": c["label"], "position": i})
    city_by_oldkey[c["key"]] = cid

order = {cid: i for i, cid in enumerate(old.get("order", []))}
records = sorted(old["candidates"], key=lambda c: order.get(c["id"], 10**6))

candidates, internals, items = [], [], []
for pos, c in enumerate(records):
    cand_id = uid("candidate", agency_id, c["id"])
    candidates.append({
        "id": cand_id, "agencyId": agency_id, "name": c["name"], "age": c["age"],
        "basedIn": c["basedIn"], "profession": c["profession"], "faith": c["faith"],
        "about": c["about"], "photoUrl": None, "photoFrame": None,
        "networkListed": False, "consentVersion": None, "consentAt": None,
    })
    internals.append({"candidateId": cand_id, "ig": c["ig"], "source": c["source"]})
    items.append({
        "id": uid("item", roster_id, cand_id), "rosterId": roster_id,
        "candidateId": cand_id, "cityId": city_by_oldkey.get(c["city"]),
        "status": c["status"], "blurb": c["blurb"],
        "privateNote": c["note"], "position": pos,
    })

seed = {
  "agency": {
    "id": agency_id, "slug": "unicorn-club", "name": "Unicorn Club",
    "plan": "studio",
    "brand": {
      "displayName": "Unicorn Club",
      "logoUrl": "/unicorn-club-logo.png",
      "cream": "#F1EDE5", "panel": "#F6F3EC", "inputBg": "#F8F5EF",
      "ink": "#1B1A17", "text2": "#6b6457", "textMuted": "#9a9486",
      "serif": "Newsreader", "sans": "Hanken Grotesk",
      "confidentialityNote": "Confidential — please do not share under any circumstances.",
    },
    "stripeCustomerId": None, "stripeSubscriptionId": None,
    "subscriptionStatus": "trialing", "stripeConnectAccountId": None,
    "connectChargesEnabled": False, "applicationFeeBps": 500,
    "networkEnabled": True,
  },
  "members": [{
    "id": uid("member", agency_id, "owner"), "agencyId": agency_id,
    "authUserId": None, "name": "Mags", "email": "mags@unicornclub.example",
    "role": "owner",
  }],
  "clients": [{
    "id": client_id, "agencyId": agency_id, "name": old["name"],
    "email": None, "authUserId": None, "active": True,
  }],
  "cities": cities,
  "candidates": candidates,
  "candidateInternal": internals,
  "rosters": [{
    "id": roster_id, "agencyId": agency_id, "clientId": client_id,
    "title": "Introductions", "status": "shared", "sharedAt": "2026-08-21T12:00:00Z",
  }],
  "rosterItems": items,
  "feedback": [],
  "bookingTypes": [
    {"id": uid("bt", agency_id, "intake"), "agencyId": agency_id, "name": "Intake conversation",
     "kind": "intake", "durationMin": 60, "priceCents": 0, "active": True},
    {"id": uid("bt", agency_id, "intro"), "agencyId": agency_id, "name": "Introduction",
     "kind": "introduction", "durationMin": 90, "priceCents": 0, "active": True},
    {"id": uid("bt", agency_id, "checkin"), "agencyId": agency_id, "name": "Check-in",
     "kind": "checkin", "durationMin": 30, "priceCents": 0, "active": True},
  ],
  "bookings": [],
  "payments": [],
}
json.dump(seed, sys.stdout, indent=2, ensure_ascii=False)
print()
