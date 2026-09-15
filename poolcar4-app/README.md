# Pool Car Dispatch — Requisition & Allocation System

A full-stack web app for requesting and allocating pool cars, backed by
**Supabase (PostgreSQL)**.

## Languages / stack

| Layer      | Technology |
|------------|------------|
| Frontend   | TypeScript, React (Next.js App Router), Tailwind CSS |
| Backend    | Node.js / TypeScript — Next.js API routes |
| Database   | PostgreSQL on Supabase, accessed via `@supabase/supabase-js` |
| Auth       | Custom signed session cookie (HMAC-SHA256) — no password for staff, name + PIN for admin |

Everything — frontend, backend, and database access — is TypeScript running
in one Next.js project. There's no separate backend server: the `app/api/*`
routes *are* the backend, and they talk to Supabase's Postgres database
directly with the service-role key.

## 1. Create the Supabase project & schema

1. Go to [supabase.com](https://supabase.com) → New project.
2. Once it's ready, open **SQL Editor → New query**, paste the entire
   contents of `db/schema.sql`, and run it. This creates all five tables
   (`users`, `vehicles`, `drivers`, `requisitions`, `activity_log`) and
   seeds 3 vehicles + 3 drivers + a demo admin account.
3. Open **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **service_role key** (not the anon key) → `SUPABASE_SERVICE_ROLE_KEY`

## 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in the two Supabase values above, plus:
- `SESSION_SECRET` — any long random string (used to sign the login cookie)

Admin PINs are **not** an env var — each admin has their own name + PIN,
stored (hashed) in the `users` table. `db/schema.sql` seeds three demo
admins:

| Name | PIN |
|------|-----|
| Fleet Manager | `4821` |
| Operations Lead | `7350` |
| IT Admin | `9042` |

To add a real admin, hash their chosen PIN and insert a row:

```bash
python3 -c "import hashlib; print(hashlib.sha256(b'THEIR_PIN').hexdigest())"
```

```sql
insert into users (name, role, pin_hash)
values ('Their Name', 'admin', 'the-hash-printed-above');
```

## 3. Install & run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. You'll land on the **Choose role** page:
- **Staff** → name-only login → submit requests, track and cancel their own, view fleet availability.
- **Admin** → name + that admin's own PIN (see table above) → approve/deny
  requests, manage the fleet, and review the activity log.

## Role separation

The two roles have deliberately non-overlapping capabilities, enforced both
in the sidebar navigation and again server-side in every API route (so a
role check is never just a hidden button):

| Capability | Staff | Admin |
|---|---|---|
| View fleet & driver availability (Dashboard) | ✅ | ✅ |
| Submit a requisition | ✅ | ❌ |
| Cancel their own request (while Pending or Scheduled) | ✅ | — |
| See their own requests' status, incl. denial reasons | ✅ (My Requests) | — |
| Approve / deny requests | ❌ | ✅ |
| Add / remove vehicles & drivers | ❌ | ✅ |
| View the activity log | ❌ | ✅ |

Admins log in with a name + their own PIN, checked against a hashed value
in the `users` table (see below for adding more admins). Staff log in with
just a name — that name becomes the `requester` on every requisition they
submit, and it's what's checked (case-insensitively) to authorize
cancelling their own request. The server always uses the signed-in
session's name for this, never whatever a client might send.

## How the pages map to the spec

- **Dashboard** (`/dashboard`, both roles) — live fleet/driver availability +
  "Requisitions & Scheduled Trips" table, polling the database every few
  seconds so it reflects new submissions/allocations without a manual
  refresh.
- **New Requisition** (`/request`, staff only) — the data-entry form. On
  submit it inserts a row with `vehicle_id`/`driver_id` still `NULL`, which
  reads as `Pending Allocation`. The confirmation shows the assigned `S.no`.
- **My Requests** (`/my-requests`, staff only) — every request that staff
  member has submitted, with live status (including `Denied` with the
  reason, and `Cancelled`), and a Cancel button while it's still Pending or
  Scheduled.
- **Allocate Vehicle** (`/admin/allocate`, admin only) — pick a pending
  requisition; the server (`GET /api/availability`) runs the date-overlap
  query against the database and returns only vehicles/drivers that are
  actually free — the admin never manually checks. Approving calls
  `POST /api/requisitions/:id/allocate`, which re-runs that same check
  server-side before writing, so a stale client can't double-book. Denying
  calls `POST /api/requisitions/:id/deny` with an optional reason.
- **Manage Fleet** (`/admin/fleet`, admin only) — add/remove vehicles and
  drivers. Removing one currently tied to a Scheduled or Active trip is
  blocked with an inline error; removal is a soft-delete (`active = false`)
  so history and the audit log stay intact.
- **Activity Log** (`/admin/activity`, admin only) — read-only feed of
  every submit, allocation, denial, cancellation, and fleet change, most
  recent first.

Every submit, allocation, denial, cancellation, and fleet change writes a
row to `activity_log` for auditability, per the spec.

## Managing people, drivers, and vehicles from SQL

Besides the Manage Fleet page, `db/schema.sql` includes SQL functions you
can run any time in the Supabase SQL editor — useful for one-off admin
tasks without touching the app:

```sql
-- Admins & staff
select add_admin('New Admin', '2468');       -- adds, or updates the PIN if the name exists
select add_staff_user('New Staff Member');   -- optional roster entry; staff can already log in with just a name

-- Fleet
select add_vehicle('UBX 123A', 'Toyota Prado');
select remove_vehicle(3);                     -- soft-deletes; blocked if it has a Scheduled/Active trip
select add_driver('New Driver', '0700 000 004');
select remove_driver(3);

-- Requisition decisions (what the Allocate Vehicle page does)
select approve_requisition(12, 2, 1);         -- (requisition id, vehicle id, driver id)
select deny_requisition(12, 'No vehicles free that week');
```

Denied requisitions show a `Denied` status (with the reason, if given) and
are excluded from the Pending Allocation list — the Allocate Vehicle page
also shows a "Recently denied" list for context.

## Project structure

```
app/
  page.tsx                 Role-choice landing page
  login/user/page.tsx      Staff login (name only)
  login/admin/page.tsx     Admin login (name + PIN)
  dashboard/page.tsx       Availability + requisitions table
  request/page.tsx         New Requisition form
  admin/allocate/page.tsx  Allocate Vehicle (admin)
  admin/fleet/page.tsx     Manage Fleet (admin)
  api/                     Backend — one route file per endpoint
lib/
  supabase.ts              Server-side Supabase client (service role)
  data.ts                  All database queries (async)
  session.ts / auth.ts     Signed cookie session handling
  api.ts                   Client-side fetch wrappers used by the pages
  types.ts                 Shared TypeScript types
components/
  AppShell.tsx             Sidebar nav + session guard used by every page
  StatusBadge.tsx           Pending/Scheduled/Active/Completed status pill
db/
  schema.sql               Run this once in the Supabase SQL editor
```

## Notes

- The Postgres `status` column is a `GENERATED ALWAYS AS (...) STORED`
  expression, not something the app ever writes to directly — this is the
  exact bug class that was fixed in the earlier Excel version (a
  blank/unassigned row can never silently read as available or scheduled).
- Row Level Security is enabled on every table as defense-in-depth, but
  all access in this app goes through the server using the service-role
  key, which bypasses RLS by design — RLS matters if you ever expose the
  anon key to the browser directly.
- To deploy, push this to Vercel (or any Node host) and set the same
  three env vars there. No further Supabase configuration is needed.
