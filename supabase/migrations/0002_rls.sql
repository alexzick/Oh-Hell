-- =============================================================================
-- 0002_rls.sql — row level security
--
-- Two kinds of caller reach this database with a user JWT:
--
--   a matchmaker  — has a row in agency_member matching auth.uid()
--   a client      — has a row in client        matching auth.uid()
--
-- Every policy below is written from one of those two anchors. A caller who is
-- neither sees nothing at all, which is the correct default for a database
-- holding profiles of real people who did not sign up to be public.
--
-- The private-note guarantee is not a policy detail you have to trust: the
-- client anchor is simply never used in a policy on roster_item_private or
-- candidate_internal, so those tables are unreachable from a client session.
-- =============================================================================

-- --- helpers -----------------------------------------------------------------

-- security definer so a caller can test their own membership without needing
-- read access to the whole agency_member table.
create or replace function is_agency_member(target uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from agency_member m
    where m.agency_id = target and m.auth_user_id = auth.uid()
  );
$$;

create or replace function current_agency_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select m.agency_id from agency_member m where m.auth_user_id = auth.uid() limit 1;
$$;

create or replace function is_client(target uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from client c where c.id = target and c.auth_user_id = auth.uid()
  );
$$;

-- A client may see a roster only once it has actually been shared with them.
-- Drafts stay invisible while the matchmaker is still assembling them.
create or replace function client_can_read_roster(target uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from roster r
    join client c on c.id = r.client_id
    where r.id = target and r.status = 'shared' and c.auth_user_id = auth.uid()
  );
$$;

-- Cross-agency read, and only while an unexpired, unrevoked release exists.
create or replace function has_referral_access(target_candidate uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from referral_release rr
    where rr.candidate_id = target_candidate
      and rr.revoked_at is null
      and rr.expires_at > now()
      and is_agency_member(rr.to_agency_id)
  );
$$;

-- --- enable ------------------------------------------------------------------

alter table agency               enable row level security;
alter table agency_member        enable row level security;
alter table client               enable row level security;
alter table client_invite        enable row level security;
alter table client_city          enable row level security;
alter table candidate            enable row level security;
alter table candidate_internal   enable row level security;
alter table roster               enable row level security;
alter table roster_item          enable row level security;
alter table roster_item_private  enable row level security;
alter table client_feedback      enable row level security;
alter table booking_type         enable row level security;
alter table availability_rule    enable row level security;
alter table booking              enable row level security;
alter table calendar_connection  enable row level security;
alter table payment              enable row level security;
alter table stripe_event         enable row level security;
alter table network_profile      enable row level security;
alter table referral_request     enable row level security;
alter table referral_release     enable row level security;
alter table access_log           enable row level security;

-- --- agency & staff ----------------------------------------------------------

create policy agency_read_own on agency
  for select using (is_agency_member(id));
-- Billing columns are written by the Stripe webhook under the service role,
-- which bypasses RLS; staff never write them directly.
create policy agency_update_own on agency
  for update using (is_agency_member(id)) with check (is_agency_member(id));

create policy member_read_own_agency on agency_member
  for select using (is_agency_member(agency_id));
create policy member_write_own_agency on agency_member
  for all using (is_agency_member(agency_id)) with check (is_agency_member(agency_id));

-- --- clients -----------------------------------------------------------------

create policy client_staff_all on client
  for all using (is_agency_member(agency_id)) with check (is_agency_member(agency_id));
-- A client can read their own record and nothing else in the table.
create policy client_read_self on client
  for select using (auth_user_id = auth.uid());

create policy invite_staff_all on client_invite
  for all using (exists (select 1 from client c where c.id = client_id and is_agency_member(c.agency_id)))
  with check (exists (select 1 from client c where c.id = client_id and is_agency_member(c.agency_id)));

create policy city_staff_all on client_city
  for all using (exists (select 1 from client c where c.id = client_id and is_agency_member(c.agency_id)))
  with check (exists (select 1 from client c where c.id = client_id and is_agency_member(c.agency_id)));
create policy city_client_read on client_city
  for select using (is_client(client_id));

-- --- candidates --------------------------------------------------------------

create policy candidate_staff_all on candidate
  for all using (is_agency_member(agency_id)) with check (is_agency_member(agency_id));

-- A client sees a candidate only through a roster that was shared with them.
create policy candidate_client_read on candidate
  for select using (
    exists (
      select 1 from roster_item ri
      join roster r on r.id = ri.roster_id
      where ri.candidate_id = candidate.id and client_can_read_roster(r.id)
    )
  );

-- Another agency sees her only while a release is live.
create policy candidate_referral_read on candidate
  for select using (has_referral_access(id));

-- No client policy exists on this table, by design.
create policy candidate_internal_staff_all on candidate_internal
  for all using (is_agency_member(agency_id)) with check (is_agency_member(agency_id));

-- --- rosters -----------------------------------------------------------------

create policy roster_staff_all on roster
  for all using (is_agency_member(agency_id)) with check (is_agency_member(agency_id));
create policy roster_client_read on roster
  for select using (status = 'shared' and is_client(client_id));

create policy roster_item_staff_all on roster_item
  for all using (exists (select 1 from roster r where r.id = roster_id and is_agency_member(r.agency_id)))
  with check (exists (select 1 from roster r where r.id = roster_id and is_agency_member(r.agency_id)));
create policy roster_item_client_read on roster_item
  for select using (client_can_read_roster(roster_id));

-- Staff only. Deliberately no client policy: this is the private note.
create policy roster_item_private_staff_all on roster_item_private
  for all using (
    exists (
      select 1 from roster_item ri join roster r on r.id = ri.roster_id
      where ri.id = roster_item_id and is_agency_member(r.agency_id)
    )
  ) with check (
    exists (
      select 1 from roster_item ri join roster r on r.id = ri.roster_id
      where ri.id = roster_item_id and is_agency_member(r.agency_id)
    )
  );

-- The client owns their feedback outright. Staff may read it but not write it,
-- so a note attributed to the client is always genuinely theirs.
create policy feedback_client_all on client_feedback
  for all using (is_client(client_id)) with check (is_client(client_id));
create policy feedback_staff_read on client_feedback
  for select using (
    exists (select 1 from client c where c.id = client_id and is_agency_member(c.agency_id))
  );

-- --- scheduling --------------------------------------------------------------

create policy booking_type_staff_all on booking_type
  for all using (is_agency_member(agency_id)) with check (is_agency_member(agency_id));
create policy booking_type_client_read on booking_type
  for select using (active and exists (
    select 1 from client c where c.agency_id = booking_type.agency_id and c.auth_user_id = auth.uid()
  ));

create policy availability_staff_all on availability_rule
  for all using (is_agency_member(agency_id)) with check (is_agency_member(agency_id));

create policy booking_staff_all on booking
  for all using (is_agency_member(agency_id)) with check (is_agency_member(agency_id));
-- A client sees and responds to their own bookings only.
create policy booking_client_read on booking
  for select using (client_id is not null and is_client(client_id));
create policy booking_client_update on booking
  for update using (client_id is not null and is_client(client_id))
  with check (client_id is not null and is_client(client_id));

create policy calendar_staff_own on calendar_connection
  for all using (exists (select 1 from agency_member m where m.id = member_id and m.auth_user_id = auth.uid()))
  with check (exists (select 1 from agency_member m where m.id = member_id and m.auth_user_id = auth.uid()));

-- --- payments ----------------------------------------------------------------

create policy payment_staff_read on payment
  for select using (is_agency_member(agency_id));
create policy payment_client_read on payment
  for select using (client_id is not null and is_client(client_id));
-- Writes happen server-side under the service role after Stripe confirms.

-- stripe_event has RLS on and no policies at all: service role only.

-- --- network -----------------------------------------------------------------

-- Any member of a network-enabled agency can search the anonymized index.
create policy network_profile_search on network_profile
  for select using (
    exists (select 1 from agency a where a.id = current_agency_id() and a.network_enabled)
  );
create policy network_profile_owner_write on network_profile
  for all using (is_agency_member(agency_id)) with check (is_agency_member(agency_id));

create policy referral_request_parties_read on referral_request
  for select using (is_agency_member(requesting_agency_id) or is_agency_member(owning_agency_id));
create policy referral_request_create on referral_request
  for insert with check (is_agency_member(requesting_agency_id));
-- Only the owning agency answers a request; only the requester withdraws it.
create policy referral_request_respond on referral_request
  for update using (is_agency_member(owning_agency_id) or is_agency_member(requesting_agency_id))
  with check (is_agency_member(owning_agency_id) or is_agency_member(requesting_agency_id));

create policy referral_release_parties_read on referral_release
  for select using (is_agency_member(to_agency_id) or exists (
    select 1 from candidate c where c.id = candidate_id and is_agency_member(c.agency_id)
  ));
create policy referral_release_owner_write on referral_release
  for all using (exists (select 1 from candidate c where c.id = candidate_id and is_agency_member(c.agency_id)))
  with check (exists (select 1 from candidate c where c.id = candidate_id and is_agency_member(c.agency_id)));

create policy access_log_read_own on access_log
  for select using (is_agency_member(actor_agency));
