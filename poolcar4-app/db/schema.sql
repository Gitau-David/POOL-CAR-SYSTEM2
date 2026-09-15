-- Pool Car Request & Approve System — Supabase/Postgres schema
-- Run this once in Supabase: Project → SQL Editor → New query → paste → Run.

-- Needed for digest(), used below to hash PINs directly in SQL so you never
-- have to run a separate Python/Node command to add a new admin.
create extension if not exists pgcrypto;

create table if not exists users (
  id            bigint generated always as identity primary key,
  name          text not null,
  role          text not null check (role in ('user','admin')),
  pin_hash      text,                          -- each admin has their own hashed PIN
  created_at    timestamptz not null default now()
);

-- Two admins can't share the same name (case-insensitive) — the login page
-- looks an admin up by name, so names must be unique among admins.
create unique index if not exists idx_users_admin_name on users (lower(name)) where role = 'admin';

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
-- before denial/cancellation support existed.
alter table requisitions add column if not exists denied_at timestamptz;
alter table requisitions add column if not exists denial_reason text;
alter table requisitions add column if not exists cancelled_at timestamptz;

-- Same status logic as the app's computeStatus() in lib/types.ts — kept in
-- sync by hand since Postgres can't express it as a generated column.
-- Cancelled takes priority over Denied (a requester can only cancel their
-- own still-pending request, so the two never really overlap, but the
-- order matters if they ever do).
drop function if exists requisition_status(bigint, date, date);
drop function if exists requisition_status(bigint, date, date, timestamptz);
create or replace function requisition_status(
  p_vehicle_id bigint, p_start date, p_end date,
  p_denied_at timestamptz default null, p_cancelled_at timestamptz default null
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

-- Convenience view for browsing in the Supabase SQL editor / Table editor —
-- the app itself queries the plain `requisitions` table and computes status
-- in TypeScript, so this view is optional, not load-bearing.
create or replace view requisitions_with_status as
select r.*, requisition_status(r.vehicle_id, r.start_date, r.end_date, r.denied_at, r.cancelled_at) as status
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

-- Lets a requester cancel their own still-pending request. Staff have no
-- login beyond a name, so p_requester is matched against requisitions.requester
-- (case-insensitive) as the only authorization check available — the app
-- enforces this the same way from the signed-in session's name. Passing
-- p_requester as null skips that check (for admin/SQL-editor use).
-- Usage: select cancel_requisition(12, 'Diana Achieng');
create or replace function cancel_requisition(p_req_id bigint, p_requester text default null)
returns text
language plpgsql
as $$
declare
  req requisitions;
begin
  select * into req from requisitions where id = p_req_id;
  if not found then return 'error: requisition not found'; end if;
  if p_requester is not null and lower(trim(req.requester)) <> lower(trim(p_requester)) then
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
-- Seed data (safe to re-run: guarded by not-exists checks)
-- ---------------------------------------------------------------------
insert into vehicles (reg_no, model)
select * from (values
  ('UBD 094S', 'Toyota Hiace'),
  ('UA 991AB', 'Toyota Land Cruiser'),
  ('UBS 840H', 'Toyota Hilux')
) as v(reg_no, model)
where not exists (select 1 from vehicles where vehicles.reg_no = v.reg_no);

insert into drivers (name, phone)
select * from (values
  ('Ivan Mugisha', '0700 000 001'),
  ('Samuel Okello', '0700 000 002'),
  ('Grace Namuli', '0700 000 003')
) as d(name, phone)
where not exists (select 1 from drivers where drivers.name = d.name);

-- Demo admin accounts, added via the function above so PINs never need to
-- be hashed by hand. Log in with the exact name below + its PIN.
select add_admin('Fleet Manager', '4821');
select add_admin('Operations Lead', '7350');
select add_admin('IT Admin', '9042');

-- To add a real admin later, just run (in the Supabase SQL editor):
--   select add_admin('Their Name', 'their-chosen-pin');
-- Running it again for the same name updates that admin's PIN instead of
-- creating a duplicate.
