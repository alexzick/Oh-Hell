-- =============================================================================
-- 0003_debrief.sql — post-date intelligence
--
-- Design notes in docs/decisions.md, ADR-007. Three things this schema insists
-- on, all of which are cheap now and unrecoverable later:
--
--   1. The prose is the record. `debrief.body` is written by a person and is
--      never rewritten by the system. Structure is derived into debrief_claim
--      and can be thrown away and recomputed.
--   2. Every account carries who is speaking and on whose behalf, because her
--      side of the evening currently reaches us second-hand.
--   3. Safety reports are a different table with different policies and no
--      route into ranking. "She wasn't into him" and "he wouldn't let her
--      leave" must not travel down the same pipe.
-- =============================================================================

-- An introduction is the event that happened. The booking that scheduled it is
-- a separate thing and may not exist — plenty of introductions get arranged
-- over text and only reported afterwards.
create table introduction (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references agency(id) on delete cascade,
  roster_item_id uuid not null references roster_item(id) on delete cascade,
  booking_id     uuid references booking(id) on delete set null,
  met_at         timestamptz,
  created_at     timestamptz not null default now()
);
create index on introduction (agency_id);
create index on introduction (roster_item_id);

create type debrief_author as enum ('client', 'candidate', 'matchmaker');
-- Whose account this is, which is not the same as who typed it.
create type debrief_voice as enum ('client', 'candidate', 'self');
create type disposition as enum ('continue', 'decline', 'unsure', 'no_contact');
create type claim_provenance as enum ('stated', 'relayed', 'inferred', 'observed');
create type claim_facet as enum
  ('disposition', 'chemistry', 'conduct', 'logistics', 'values', 'correction');

create table debrief (
  id              uuid primary key default gen_random_uuid(),
  introduction_id uuid not null references introduction(id) on delete cascade,
  agency_id       uuid not null references agency(id) on delete cascade,
  author_kind     debrief_author not null,
  author_id       uuid,
  -- 'client'    — his own account
  -- 'candidate' — her account, typed up by a matchmaker until candidates have
  --               accounts of their own
  -- 'self'      — the matchmaker's own read of the pairing
  voice           debrief_voice not null,
  provenance      claim_provenance not null,
  -- The one structured field worth demanding at capture time: it is the
  -- training label for everything else.
  disposition     disposition,
  body            text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- One account per voice per introduction; edits update in place.
  unique (introduction_id, voice)
);
create index on debrief (agency_id);
create index on debrief (introduction_id);

-- Derived from the prose, never required of the writer, and not committed until
-- a human accepts it — see ADR-007. Empty until extraction is switched on.
create table debrief_claim (
  id                uuid primary key default gen_random_uuid(),
  debrief_id        uuid not null references debrief(id) on delete cascade,
  facet             claim_facet not null,
  dimension         text not null,
  valence           smallint check (valence between -2 and 2),
  -- His account contains claims about her and claims about himself. Without
  -- this his mood lands permanently in her record.
  subject_person    uuid,
  provenance        claim_provenance not null,
  confidence        real check (confidence between 0 and 1),
  -- Character range in debrief.body that produced the claim, so every claim is
  -- traceable back to the sentence a person actually wrote.
  source_span       int4range,
  confirmed_by      uuid references agency_member(id) on delete set null,
  confirmed_at      timestamptz,
  created_at        timestamptz not null default now()
);
create index on debrief_claim (debrief_id);
create index on debrief_claim (facet, dimension);

create type safety_category as enum
  ('discomfort', 'boundary_violation', 'misrepresentation', 'threat');

-- Deliberately not a facet. No valence, no confidence, no path to a ranking:
-- this is an incident that needs a named human, not a feature.
create table safety_report (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references agency(id) on delete cascade,
  introduction_id uuid references introduction(id) on delete set null,
  reporter_kind   debrief_author not null,
  reporter_id     uuid,
  category        safety_category not null,
  severity        smallint not null check (severity between 1 and 5),
  body            text not null default '',
  acknowledged_by uuid references agency_member(id) on delete set null,
  acknowledged_at timestamptz,
  created_at      timestamptz not null default now()
);
create index on safety_report (agency_id, acknowledged_at);

-- --- policies ----------------------------------------------------------------

alter table introduction   enable row level security;
alter table debrief        enable row level security;
alter table debrief_claim  enable row level security;
alter table safety_report  enable row level security;

create policy introduction_staff_all on introduction
  for all using (is_agency_member(agency_id)) with check (is_agency_member(agency_id));
create policy introduction_client_read on introduction
  for select using (
    exists (
      select 1 from roster_item ri join roster r on r.id = ri.roster_id
      where ri.id = roster_item_id and client_can_read_roster(r.id)
    )
  );

create policy debrief_staff_all on debrief
  for all using (is_agency_member(agency_id)) with check (is_agency_member(agency_id));

-- The wall. A client reads and writes their own account and has no policy that
-- could return anyone else's — her side is not filtered out of their view, it
-- is unreachable from their session.
create policy debrief_client_own on debrief
  for all using (
    voice = 'client' and author_kind = 'client'
    and exists (
      select 1 from introduction i
      join roster_item ri on ri.id = i.roster_item_id
      join roster r on r.id = ri.roster_id
      where i.id = introduction_id and is_client(r.client_id)
    )
  ) with check (
    voice = 'client' and author_kind = 'client'
    and exists (
      select 1 from introduction i
      join roster_item ri on ri.id = i.roster_item_id
      join roster r on r.id = ri.roster_id
      where i.id = introduction_id and is_client(r.client_id)
    )
  );

-- Claims are statements about people. Staff only, with no client policy at all.
create policy debrief_claim_staff_all on debrief_claim
  for all using (
    exists (select 1 from debrief d where d.id = debrief_id and is_agency_member(d.agency_id))
  ) with check (
    exists (select 1 from debrief d where d.id = debrief_id and is_agency_member(d.agency_id))
  );

create policy safety_staff_all on safety_report
  for all using (is_agency_member(agency_id)) with check (is_agency_member(agency_id));
-- A reporter may file and read back their own report, and nothing else.
create policy safety_client_own on safety_report
  for all using (reporter_id = auth.uid()) with check (reporter_id = auth.uid());
