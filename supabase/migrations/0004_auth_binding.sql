-- =============================================================================
-- 0004_auth_binding.sql — tying a sign-in to a person
--
-- Every RLS policy hangs off one of two joins: agency_member.auth_user_id or
-- client.auth_user_id equalling auth.uid(). Something has to populate them.
--
-- The rule is invite-by-email: a matchmaker or client row exists first, with an
-- email on it, and the row is claimed the moment someone proves they own that
-- inbox by completing a magic link. Nobody self-registers into an agency.
--
-- Note what this does *not* do: it grants nothing to an authenticated user who
-- matches no row. They sign in successfully and see nothing at all, which is
-- the correct outcome and avoids an email-enumeration oracle on the sign-in
-- form — we can accept any address, say "check your inbox", and mean it.
-- =============================================================================

create or replace function bind_auth_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update agency_member
     set auth_user_id = new.id
   where email = new.email and auth_user_id is null;

  update client
     set auth_user_id = new.id
   where email = new.email and auth_user_id is null;

  -- An invite is spent once it has been used.
  update client_invite ci
     set claimed_at = now()
    from client c
   where ci.client_id = c.id
     and c.auth_user_id = new.id
     and ci.claimed_at is null;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function bind_auth_user();

-- Re-binding for an existing auth user whose row was created afterwards: the
-- matchmaker adds a client who already has an account from another agency, or
-- fixes a typo in an email. Runs on the row rather than on auth.users.
create or replace function bind_existing_auth_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  found_id uuid;
begin
  if new.auth_user_id is null and new.email is not null then
    select id into found_id from auth.users where email = new.email limit 1;
    new.auth_user_id := found_id;
  end if;
  return new;
end $$;

create trigger client_bind_auth
  before insert or update of email on client
  for each row execute function bind_existing_auth_user();

create trigger member_bind_auth
  before insert or update of email on agency_member
  for each row execute function bind_existing_auth_user();
