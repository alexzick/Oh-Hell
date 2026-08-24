-- =============================================================================
-- 0001_schema.sql — core multi-tenant schema
--
-- Tenancy: `agency` is the tenant. Every table below either carries agency_id
-- or reaches it through exactly one hop, so row-level security is uniform.
--
-- The confidentiality rule from the original tool ("the matchmaker's private
-- note must never reach the client") is enforced structurally, not by filters:
-- private fields live in separate tables that client roles have no policy on
-- at all. See 0002_rls.sql.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- --- agencies & staff --------------------------------------------------------

create type plan_key as enum ('solo', 'studio', 'house');
create type member_role as enum ('owner', 'matchmaker', 'assistant');

create table agency (
  id                        uuid primary key default gen_random_uuid(),
  slug                      text not null unique,
  name                      text not null,
  -- White-label. Shape mirrors the Brand interface in lib/types.ts and is
  -- rendered as CSS custom properties, so a new agency restyles the whole
  -- client portal without a deploy.
  brand                     jsonb not null default '{}'::jsonb,
  plan                      plan_key not null default 'solo',

  -- Billing leg 1: the agency subscribes to the platform.
  stripe_customer_id        text unique,
  stripe_subscription_id    text unique,
  subscription_status       text,
  -- Billing leg 2: the agency's clients pay the agency through the platform.
  stripe_connect_account_id text unique,
  connect_charges_enabled   boolean not null default false,
  application_fee_bps       integer not null default 500
                              check (application_fee_bps between 0 and 3000),

  -- Network participation is off until an agency opts in (ADR-003).
  network_enabled           boolean not null default false,
  created_at                timestamptz not null default now()
);

create table agency_member (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references agency(id) on delete cascade,
  auth_user_id uuid unique,
  name         text not null,
  email        citext not null,
  role         member_role not null default 'matchmaker',
  created_at   timestamptz not null default now(),
  unique (agency_id, email)
);
create index on agency_member (agency_id);

-- --- clients -----------------------------------------------------------------

create table client (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references agency(id) on delete cascade,
  name         text not null,
  email        citext,
  -- Populated when the client accepts their portal invite; this is the join
  -- that every client-side RLS policy hangs off.
  auth_user_id uuid unique,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index on client (agency_id);

create table client_invite (
  token      text primary key,
  client_id  uuid not null references client(id) on delete cascade,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

-- City tabs are per client, editable, and ordered — they are how a client
-- thinks about their own roster ("who's in New York"), not a global taxonomy.
create table client_city (
  id        uuid primary key default gen_random_uuid(),
  client_id uuid not null references client(id) on delete cascade,
  key       text not null,
  label     text not null,
  position  integer not null default 0,
  unique (client_id, key)
);
create index on client_city (client_id);

-- --- candidates --------------------------------------------------------------

-- Facts about her that are true no matter which client is looking.
-- Nothing client-specific lives here, which is what makes it safe to show a
-- candidate to a second client without leaking the first relationship.
create table candidate (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references agency(id) on delete cascade,
  name        text not null,
  age         text not null default '',
  based_in    text not null default '',
  profession  text not null default '',
  faith       text not null default '',
  about       text not null default '',
  photo_url   text,
  photo_frame jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on candidate (agency_id);

-- Internal-only columns, split into their own table so that "the client can
-- read a candidate on their roster" never has to be expressed as a
-- column filter. A leak here requires a policy mistake on THIS table.
create table candidate_internal (
  candidate_id     uuid primary key references candidate(id) on delete cascade,
  agency_id        uuid not null references agency(id) on delete cascade,
  ig               text not null default '',
  source           text not null default '',
  notes            text not null default '',
  -- Network listing requires her recorded consent (ADR-003); enforced by
  -- trigger below, not just convention.
  network_listed   boolean not null default false,
  consent_version  text,
  consent_at       timestamptz,
  consent_source   text
);
create index on candidate_internal (agency_id);

create or replace function require_consent_before_listing()
returns trigger language plpgsql as $$
begin
  if new.network_listed and (new.consent_at is null or new.consent_version is null) then
    raise exception
      'candidate % cannot be listed in the network without a recorded consent',
      new.candidate_id;
  end if;
  return new;
end $$;

create trigger candidate_internal_consent_guard
  before insert or update on candidate_internal
  for each row execute function require_consent_before_listing();

-- --- rosters -----------------------------------------------------------------

create type roster_status as enum ('draft', 'shared');
create type match_status as enum ('yes', 'maybe', 'hold', 'passed');
create type client_reaction as enum ('interested', 'curious', 'pass');

-- A curated shortlist sent to one client. Multiple rosters per client lets a
-- matchmaker send round two without disturbing round one.
create table roster (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null references agency(id) on delete cascade,
  client_id  uuid not null references client(id) on delete cascade,
  title      text not null default 'Roster',
  status     roster_status not null default 'draft',
  shared_at  timestamptz,
  created_at timestamptz not null default now()
);
create index on roster (client_id);

-- One candidate considered for one client. Status, blurb and position are
-- properties of the *pairing*, not of the woman.
create table roster_item (
  id           uuid primary key default gen_random_uuid(),
  roster_id    uuid not null references roster(id) on delete cascade,
  candidate_id uuid not null references candidate(id) on delete cascade,
  city_id      uuid references client_city(id) on delete set null,
  status       match_status not null default 'maybe',
  blurb        text not null default '',
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (roster_id, candidate_id)
);
create index on roster_item (roster_id);
create index on roster_item (candidate_id);

-- The matchmaker's candid note. Its own table, its own policies, and the
-- client role is granted nothing on it. This is the whole point.
create table roster_item_private (
  roster_item_id uuid primary key references roster_item(id) on delete cascade,
  note           text not null default '',
  updated_at     timestamptz not null default now(),
  updated_by     uuid references agency_member(id) on delete set null
);

-- The client's own row: their reaction and their words. Written by the client,
-- read-only to the agency, so a note attributed to the client is always
-- actually theirs.
create table client_feedback (
  roster_item_id uuid primary key references roster_item(id) on delete cascade,
  client_id      uuid not null references client(id) on delete cascade,
  reaction       client_reaction,
  note           text not null default '',
  updated_at     timestamptz not null default now()
);
create index on client_feedback (client_id);

-- --- scheduling --------------------------------------------------------------

create type booking_kind as enum ('intake', 'introduction', 'checkin');
create type booking_status as enum ('proposed', 'confirmed', 'declined', 'completed', 'cancelled');

create table booking_type (
  id           uuid primary key default gen_random_uuid(),
  agency_id    uuid not null references agency(id) on delete cascade,
  name         text not null,
  kind         booking_kind not null default 'intake',
  duration_min integer not null default 45 check (duration_min > 0),
  -- Non-zero turns this into a paid booking, charged through Connect.
  price_cents  integer not null default 0 check (price_cents >= 0),
  active       boolean not null default true
);
create index on booking_type (agency_id);

create table availability_rule (
  id         uuid primary key default gen_random_uuid(),
  agency_id  uuid not null references agency(id) on delete cascade,
  member_id  uuid not null references agency_member(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),
  start_min  smallint not null check (start_min between 0 and 1440),
  end_min    smallint not null check (end_min between 0 and 1440),
  timezone   text not null default 'America/New_York',
  check (end_min > start_min)
);
create index on availability_rule (member_id);

create table booking (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references agency(id) on delete cascade,
  booking_type_id uuid not null references booking_type(id) on delete restrict,
  -- Exactly which parties are involved depends on kind: an intake is
  -- member+client, an introduction is client+candidate off the back of a
  -- roster item, a check-in is member+client.
  client_id       uuid references client(id) on delete cascade,
  candidate_id    uuid references candidate(id) on delete set null,
  member_id       uuid references agency_member(id) on delete set null,
  roster_item_id  uuid references roster_item(id) on delete set null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  status          booking_status not null default 'proposed',
  location        text not null default '',
  notes           text not null default '',
  -- Seam for two-way calendar sync; see docs/architecture.md.
  external_event_id text,
  stripe_payment_intent_id text,
  created_at      timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on booking (agency_id, starts_at);
create index on booking (client_id);

create table calendar_connection (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references agency_member(id) on delete cascade,
  provider      text not null,
  external_id   text not null,
  -- Refresh tokens are held in Supabase Vault, not here; this is the pointer.
  vault_secret_id uuid,
  created_at    timestamptz not null default now(),
  unique (member_id, provider)
);

-- --- payments ----------------------------------------------------------------

create table payment (
  id                       uuid primary key default gen_random_uuid(),
  agency_id                uuid not null references agency(id) on delete cascade,
  client_id                uuid references client(id) on delete set null,
  description              text not null default '',
  amount_cents             integer not null,
  application_fee_cents    integer not null default 0,
  currency                 text not null default 'usd',
  status                   text not null default 'pending',
  stripe_payment_intent_id text unique,
  stripe_checkout_session_id text unique,
  created_at               timestamptz not null default now()
);
create index on payment (agency_id, created_at desc);

-- Idempotency ledger for Stripe webhooks: a replayed event is a no-op.
create table stripe_event (
  id           text primary key,
  type         text not null,
  processed_at timestamptz not null default now()
);

-- --- network (ADR-003) -------------------------------------------------------

create type referral_state as enum ('requested', 'released', 'declined', 'withdrawn', 'expired');

-- The anonymized projection other agencies can search. Deliberately coarse:
-- no name, no photo, no handles, no free text that could identify her.
create table network_profile (
  id                  uuid primary key default gen_random_uuid(),
  candidate_id        uuid not null unique references candidate(id) on delete cascade,
  agency_id           uuid not null references agency(id) on delete cascade,
  age_band            text not null,
  metro               text not null,
  profession_category text not null,
  faith               text not null default '',
  relocation_open     boolean not null default false,
  -- One line, written by the owning matchmaker, that must not identify her.
  headline            text not null default '',
  listed_at           timestamptz not null default now()
);
create index on network_profile (metro, age_band);

create table referral_request (
  id                   uuid primary key default gen_random_uuid(),
  network_profile_id   uuid not null references network_profile(id) on delete cascade,
  requesting_agency_id uuid not null references agency(id) on delete cascade,
  owning_agency_id     uuid not null references agency(id) on delete cascade,
  -- An anonymized description of the client being matched, so the owning
  -- matchmaker can judge fit without either side de-anonymizing first.
  client_brief         text not null default '',
  message              text not null default '',
  state                referral_state not null default 'requested',
  created_at           timestamptz not null default now(),
  responded_at         timestamptz,
  check (requesting_agency_id <> owning_agency_id)
);
create index on referral_request (owning_agency_id, state);
create index on referral_request (requesting_agency_id, state);

-- The consent record. Access to a real candidate across an agency boundary
-- exists only while a matching row here is live — nothing else grants it.
create table referral_release (
  id                   uuid primary key default gen_random_uuid(),
  referral_request_id  uuid not null unique references referral_request(id) on delete cascade,
  candidate_id         uuid not null references candidate(id) on delete cascade,
  to_agency_id         uuid not null references agency(id) on delete cascade,
  -- Which columns were released, for the audit trail.
  released_fields      text[] not null default '{}',
  expires_at           timestamptz not null,
  revoked_at           timestamptz,
  created_at           timestamptz not null default now()
);
create index on referral_release (to_agency_id, candidate_id);

create table access_log (
  id           bigserial primary key,
  actor_agency uuid references agency(id) on delete set null,
  actor_user   uuid,
  action       text not null,
  subject      text not null,
  subject_id   uuid,
  at           timestamptz not null default now()
);
create index on access_log (subject, subject_id, at desc);
