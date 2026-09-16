create extension if not exists pgcrypto;

create table if not exists users (
  id            bigint generated always as identity primary key,
  name          text not null,
  role          text not null check (role in ('user','admin')),
  pin_hash      text,                          -- each admin has their own hashed PIN
  last_login    timestamptz,
  created_at    timestamptz not null default now()
);

alter table users add column if not exists last_login timestamptz;

-- Two admins can't share the same name (case-insensitive) — the login page
-- looks an admin up by name, so names must be unique among admins.
create unique index if not exists idx_users_admin_name on users (lower(name)) where role = 'admin';

-- Same idea for staff — lets the app upsert a roster row + last_login on
-- every staff login without creating a duplicate per person.
create unique index if not exists idx_users_staff_name on users (lower(name)) where role = 'user';

create table if not exists vehicles (
  id            bigint generated always as identity primary key,
  reg_no        text unique not null,
  model         text not null,
  active        boolean not null default true, -- soft-delete instead of hard delete
  created_at    timestamptz not null default now()
);

create table if not exists drivers (
  id            bigint generated always as identity primary key,
  name          text not null,
  phone         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- One row per requisition. This IS the Allocation Log.
--
-- NOTE: status is intentionally NOT a generated column. Postgres requires
-- generated-column expressions to be immutable, but "is this date range in
-- the past/present/future" depends on today's date, which isn't immutable —
-- Postgres rejects that at table-creation time. Status is instead computed
-- consistently in one place in the app (lib/data.ts) every time a row is
-- read, from vehicle_id + start_date + end_date — so it's still never
-- something anyone can set directly, just derived somewhere other than a
-- stored column. See requisition_status() and the view below if you want
-- to see status while browsing in the SQL editor.
create table if not exists requisitions (
  id            bigint generated always as identity primary key,
  sno           bigint generated always as identity,
  requester     text not null,
  submitted_by  text,
  department    text not null,
  start_date    date not null,
  end_date      date not null,
  origin        text not null,
  destination   text not null,
  purpose       text,
  vehicle_id    bigint references vehicles(id),
  driver_id     bigint references drivers(id),
  created_at    timestamptz not null default now(),
  allocated_at  timestamptz,
  denied_at     timestamptz,
  denial_reason text,
  cancelled_at  timestamptz,
  check (end_date >= start_date)
);

-- Safe to re-run against a database that already has this table from
-- before denial/cancellation/submitted_by support existed.
alter table requisitions add column if not exists denied_at timestamptz;
alter table requisitions add column if not exists denial_reason text;
alter table requisitions add column if not exists cancelled_at timestamptz;
-- submitted_by is the signed-in session name at the moment of submission —
-- immutable, used for ownership checks. requester is a free-text field (who
-- the trip is actually for) that the submitter can edit, e.g. an assistant
-- filing on behalf of someone else. They're often the same value, but only
-- submitted_by is trusted for "is this my request?" checks.
alter table requisitions add column if not exists submitted_by text;
update requisitions set submitted_by = requester where submitted_by is null;

--Same status logic as the app's computeStatus() in lib/types.ts — kept
-- in sync by hand since Postgres can't express it as a generated column.

-- The view depends on the older function signature, so remove the view first.
drop view if exists requisitions_with_status;

-- Remove old function signatures, including the previous four-argument version.
drop function if exists requisition_status(bigint, date, date);
drop function if exists requisition_status(bigint, date, date, timestamptz);
drop function if exists requisition_status(
  bigint,
  date,
  date,
  timestamptz,
  timestamptz
);

create function requisition_status(
  p_vehicle_id bigint,
  p_start date,
  p_end date,
  p_denied_at timestamptz default null,
  p_cancelled_at timestamptz default null
)
returns text
language sql
stable
as $$
  select case
    when p_cancelled_at is not null then 'Cancelled'
    when p_denied_at is not null then 'Denied'
    when p_vehicle_id is null then 'Pending Allocation'
    when current_date > p_end then 'Completed'
    when current_date >= p_start then 'Active'
    else 'Scheduled'
  end;
$$;

-- Recreate the view against the new five-argument function.
create view requisitions_with_status as
select
  r.*,
  requisition_status(
    r.vehicle_id,
    r.start_date,
    r.end_date,
    r.denied_at,
    r.cancelled_at
  ) as status
from requisitions r;
-- Append-only audit trail — every submit / allocate / fleet change lands here
create table if not exists activity_log (
  id             bigint generated always as identity primary key,
  requisition_id bigint references requisitions(id),
  actor_role     text not null check (actor_role in ('user','admin','system')),
  action         text not null,          -- e.g. 'submitted', 'allocated', 'vehicle_added'
  details        jsonb,
  created_at     timestamptz not null default now()
);

-- A single shared chatroom between staff and admins. Simple by design: one
-- channel, no threads/DMs — everyone signed in can post and read.
create table if not exists messages (
  id           bigint generated always as identity primary key,
  sender_name  text not null,
  sender_role  text not null check (sender_role in ('user','admin')),
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_messages_created_at on messages (created_at);

-- Speeds up the double-booking / availability check (date-range overlap scan)
create index if not exists idx_req_vehicle_dates on requisitions (vehicle_id, start_date, end_date);
create index if not exists idx_req_driver_dates on requisitions (driver_id, start_date, end_date);

-- Row Level Security: all reads/writes for this app go through the server
-- (Next.js API routes) using the Supabase service-role key, which bypasses
-- RLS by design. RLS is enabled here as defense-in-depth in case the
-- anon/public key is ever exposed to the browser.
alter table users enable row level security;
alter table vehicles enable row level security;
alter table drivers enable row level security;
alter table requisitions enable row level security;
alter table activity_log enable row level security;
alter table messages enable row level security;

-- ---------------------------------------------------------------------
-- Functions to add people later — run these any time, no app redeploy
-- or external hashing needed. Both are idempotent (safe to re-run) and
-- return the resulting row.
-- ---------------------------------------------------------------------

-- Add a new admin, or update an existing admin's PIN if the name already
-- exists. Usage:  select add_admin('New Admin', '2468');
create or replace function add_admin(p_name text, p_pin text)
returns users
language plpgsql
as $$
declare
  result users;
begin
  insert into users (name, role, pin_hash)
  values (trim(p_name), 'admin', encode(digest(p_pin, 'sha256'), 'hex'))
  on conflict ((lower(name))) where role = 'admin'
  do update set pin_hash = excluded.pin_hash
  returning * into result;
  return result;
end;
$$;

-- Register a staff (non-admin) user. Staff sign in with just a name — no
-- PIN — so this is only for keeping a roster/audit trail; the app doesn't
-- require a matching row to let someone log in as staff. Usage:
--   select add_staff_user('New Staff Member');
create or replace function add_staff_user(p_name text)
returns users
language plpgsql
as $$
declare
  result users;
begin
  insert into users (name, role, pin_hash)
  values (trim(p_name), 'user', null)
  returning * into result;
  return result;
end;
$$;

-- Called by the app on every successful login (both roles) to keep a
-- persistent record of who's used the system and when they last signed in.
-- Finds-or-creates rather than using ON CONFLICT, since the two roles have
-- separate partial unique indexes and a single conflict target can't match
-- both. Usage: select record_login('Diana Achieng', 'user');
create or replace function record_login(p_name text, p_role text)
returns users
language plpgsql
as $$
declare
  result users;
begin
  if p_role not in ('user', 'admin') then
    raise exception 'invalid role: %', p_role;
  end if;

  select * into result from users where role = p_role and lower(name) = lower(trim(p_name));
  if found then
    update users set last_login = now() where id = result.id returning * into result;
  else
    insert into users (name, role, last_login) values (trim(p_name), p_role, now()) returning * into result;
  end if;
  return result;
end;
$$;

-- ---------------------------------------------------------------------
-- Fleet management functions — mirror what the Manage Fleet page does in
-- the app, but callable directly from the SQL editor. Both removals are
-- soft-deletes (active = false) blocked if the vehicle/driver has a
-- Scheduled or Active trip, exactly like the app's own guard.
-- ---------------------------------------------------------------------

-- Add a vehicle, or reactivate + update the model if that reg_no already
-- exists (including one that was previously removed). Usage:
--   select add_vehicle('UBX 123A', 'Toyota Prado');
create or replace function add_vehicle(p_reg_no text, p_model text)
returns vehicles
language plpgsql
as $$
declare
  result vehicles;
begin
  insert into vehicles (reg_no, model, active)
  values (trim(p_reg_no), trim(p_model), true)
  on conflict (reg_no) do update set model = excluded.model, active = true
  returning * into result;
  return result;
end;
$$;

-- Usage: select remove_vehicle(3);  -- returns a short status message
create or replace function remove_vehicle(p_id bigint)
returns text
language plpgsql
as $$
declare
  in_use boolean;
begin
  select exists(
    select 1 from requisitions
    where vehicle_id = p_id and denied_at is null and cancelled_at is null and end_date >= current_date
  ) into in_use;
  if in_use then
    return 'blocked: vehicle has a scheduled or active trip';
  end if;
  update vehicles set active = false where id = p_id;
  if not found then return 'error: no vehicle with that id'; end if;
  return 'removed';
end;
$$;

-- Usage: select add_driver('New Driver', '0700 000 004');
create or replace function add_driver(p_name text, p_phone text default null)
returns drivers
language plpgsql
as $$
declare
  result drivers;
begin
  insert into drivers (name, phone, active)
  values (trim(p_name), p_phone, true)
  returning * into result;
  return result;
end;
$$;

-- Usage: select remove_driver(3);
create or replace function remove_driver(p_id bigint)
returns text
language plpgsql
as $$
declare
  in_use boolean;
begin
  select exists(
    select 1 from requisitions
    where driver_id = p_id and denied_at is null and cancelled_at is null and end_date >= current_date
  ) into in_use;
  if in_use then
    return 'blocked: driver has a scheduled or active trip';
  end if;
  update drivers set active = false where id = p_id;
  if not found then return 'error: no driver with that id'; end if;
  return 'removed';
end;
$$;

-- ---------------------------------------------------------------------
-- Requisition decisions — mirror the app's Allocate Vehicle page (approve)
-- and add the deny path the app didn't have before. Both write to
-- activity_log for the same audit trail the app produces.
-- ---------------------------------------------------------------------

-- Usage: select approve_requisition(12, 2, 1);  -- (requisition id, vehicle id, driver id)
create or replace function approve_requisition(p_req_id bigint, p_vehicle_id bigint, p_driver_id bigint)
returns text
language plpgsql
as $$
declare
  req requisitions;
  conflict_v boolean;
  conflict_d boolean;
begin
  select * into req from requisitions where id = p_req_id;
  if not found then return 'error: requisition not found'; end if;
  if req.cancelled_at is not null then return 'error: requisition was cancelled'; end if;
  if req.denied_at is not null then return 'error: requisition was already denied'; end if;
  if req.vehicle_id is not null then return 'error: already allocated'; end if;

  select exists(
    select 1 from requisitions r
    where r.id <> p_req_id and r.vehicle_id = p_vehicle_id
      and r.start_date <= req.end_date and r.end_date >= req.start_date
  ) into conflict_v;
  if conflict_v then return 'error: vehicle not available for these dates'; end if;

  select exists(
    select 1 from requisitions r
    where r.id <> p_req_id and r.driver_id = p_driver_id
      and r.start_date <= req.end_date and r.end_date >= req.start_date
  ) into conflict_d;
  if conflict_d then return 'error: driver not available for these dates'; end if;

  update requisitions
  set vehicle_id = p_vehicle_id, driver_id = p_driver_id, allocated_at = now()
  where id = p_req_id;

  insert into activity_log (requisition_id, actor_role, action, details)
  values (p_req_id, 'admin', 'allocated', jsonb_build_object('vehicleId', p_vehicle_id, 'driverId', p_driver_id));

  return 'approved';
end;
$$;

-- Usage: select deny_requisition(12, 'No vehicles free that week');
create or replace function deny_requisition(p_req_id bigint, p_reason text default null)
returns text
language plpgsql
as $$
declare
  req requisitions;
begin
  select * into req from requisitions where id = p_req_id;
  if not found then return 'error: requisition not found'; end if;
  if req.cancelled_at is not null then return 'error: requisition was cancelled'; end if;
  if req.vehicle_id is not null then return 'error: already allocated, cannot deny'; end if;
  if req.denied_at is not null then return 'error: already denied'; end if;

  update requisitions set denied_at = now(), denial_reason = p_reason where id = p_req_id;

  insert into activity_log (requisition_id, actor_role, action, details)
  values (p_req_id, 'admin', 'denied', jsonb_build_object('reason', p_reason));

  return 'denied';
end;
$$;

-- Lets a requester cancel their own still-pending request. Ownership is
-- checked against submitted_by first (the actual signed-in name at
-- submission time), falling back to requester for older rows from before
-- submitted_by existed — requester is editable free text, so it's no
-- longer trusted for authorization once submitted_by is present.
-- Passing p_requester as null skips the check (for admin/SQL-editor use).
-- Usage: select cancel_requisition(12, 'Diana Achieng');
create or replace function cancel_requisition(p_req_id bigint, p_requester text default null)
returns text
language plpgsql
as $$
declare
  req requisitions;
  owner text;
begin
  select * into req from requisitions where id = p_req_id;
  if not found then return 'error: requisition not found'; end if;
  owner := coalesce(req.submitted_by, req.requester);
  if p_requester is not null and lower(trim(owner)) <> lower(trim(p_requester)) then
    return 'error: not your request';
  end if;
  if req.vehicle_id is not null then return 'error: already allocated, ask an admin instead'; end if;
  if req.denied_at is not null then return 'error: already denied'; end if;
  if req.cancelled_at is not null then return 'error: already cancelled'; end if;

  update requisitions set cancelled_at = now() where id = p_req_id;

  insert into activity_log (requisition_id, actor_role, action, details)
  values (p_req_id, 'user', 'cancelled', null);

  return 'cancelled';
end;
$$;

-- ---------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------
-- No example vehicles or drivers are seeded — add your real fleet via the
-- Manage Fleet page, or with add_vehicle()/add_driver() above.
--
-- If you previously ran an older version of this script that seeded demo
-- vehicles/drivers (UBD 094S, UA 991AB, UBS 840H, Ivan Mugisha, Samuel
-- Okello, Grace Namuli), this removes them — but only if none of them are
-- tied to a real requisition, so it won't silently
