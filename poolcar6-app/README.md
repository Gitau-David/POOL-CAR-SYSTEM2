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
stored (hashed) in the `users` table. `db/schema.sql` seeds these accounts:

| Name | Role | PIN |
|------|------|-----|
| Fleet Manager | Admin | `4821` |
| Operations Lead | Admin | `7350` |
| IT Admin | **IT Admin** (super-admin tier) | `1234` |

To add a real admin, either run `select add_admin('Their Name', 'their-pin');`
in the Supabase SQL editor (hashes the PIN for you), or use the IT Admin's
"Admins & Directory" page in the app itself.

## 3. Install & run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. You'll land on the **Choose role** page:
- **Staff** → name-only login → submit requests, track and cancel their own, view fleet availability.
- **Admin** → name + that admin's own PIN (see table above) → approve/deny
  requests, manage the fleet, and review the activity log. The **IT Admin**
  account logs in through this same page — the server resolves whether a
  name+PIN belongs to a regular admin or the IT admin tier and grants
  access accordingly.

## Role separation

Capabilities are enforced both in the sidebar navigation and again
server-side in every API route (so a role check is never just a hidden
button). There are three roles: **Staff**, **Admin**, and **IT Admin** (a
single super-admin tier that gets everything Admin has, plus admin-account
management):

| Capability | Staff | Admin | IT Admin |
|---|---|---|---|
| View fleet & driver availability (Dashboard) | ✅ | ✅ | ✅ |
| Submit a requisition | ✅ | ❌ | ❌ |
| Cancel their own request (while Pending or Scheduled) | ✅ | — | — |
| See their own requests' status, incl. denial reasons | ✅ (My Requests) | — | — |
| Approve / deny requests | ❌ | ✅ | ✅ |
| Add / remove vehicles & drivers | ❌ | ✅ | ✅ |
| View / filter / delete / print the activity log | ❌ | ✅ | ✅ |
| Transaction history + CSV export | ✅ (own only) | ✅ (all) | ✅ (all) |
| Messages (shared chatroom) | ✅ | ✅ | ✅ |
| Add / remove admin accounts, look up any person's history | ❌ | ❌ | ✅ |

Admins log in with a name + their own PIN, checked against a hashed value
in the `users` table. Staff log in with just a name. **Two separate fields
track "who this trip is for" vs "who's actually accountable for it":**
`requester` is free text on the New Requisition form (editable — e.g. an
assistant filing on someone else's behalf), while `submitted_by` is always
the signed-in session's name, set server-side and never trusted from the
client. Ownership checks (cancelling a request, My Requests, the "mine"
scope on Transaction History) all key off `submitted_by`, not the editable
`requester` field.

Every login, submission, allocation, denial, cancellation, and fleet
change is recorded in `activity_log` **with the actual person's name**
(`actor_name`), not just their role — so the Activity Log page (and the
IT Admin's per-person lookup) can answer "what did this specific person
do, and when." `record_login()` also updates `last_login` on the `users`
table and auto-registers staff there on first login.

### Sessions are per-tab, not per-browser

The session token lives in `sessionStorage` and is sent as an
`Authorization: Bearer` header, not a cookie. This is deliberate: cookies
are shared by every tab in a browser, so logging in as Admin in one tab
would otherwise silently swap the session out from under a Staff tab open
right next to it. Each tab now keeps its own independent identity.


## How the pages map to the spec

- **Dashboard** (`/dashboard`, both roles) — live fleet/driver availability +
  "Requisitions & Scheduled Trips" table (including `Pending Allocation`
  rows), polling the database every few seconds so it reflects new
  submissions/allocations without a manual refresh, for both roles.
- **New Requisition** (`/request`, staff only) — the data-entry form. The
  Requester field is prefilled with your name but editable. On submit it
  inserts a row with `vehicle_id`/`driver_id` still `NULL`, which reads as
  `Pending Allocation`. The confirmation shows the assigned `S.no`.
- **My Requests** (`/my-requests`, staff only) — every request you've
  submitted (matched by `submitted_by`, regardless of what you typed as
  Requester), with live status and a Cancel button while it's still
  Pending or Scheduled.
- **Allocate Vehicle** (`/admin/allocate`, admin only) — pick a pending
  requisition; the server (`GET /api/availability`) runs the date-overlap
  query against the database and returns only vehicles/drivers that are
  actually free — the admin never manually checks. Approving calls
  `POST /api/requisitions/:id/allocate`, sets the vehicle/driver, and moves
  status to `Scheduled`/`Active`; it re-runs that same availability check
  server-side before writing, so a stale client can't double-book. Denying
  calls `POST /api/requisitions/:id/deny` with an optional reason.
- **Manage Fleet** (`/admin/fleet`, admin only) — add/remove vehicles and
  drivers. Removing one currently tied to a Scheduled or Active trip is
  blocked with an inline error; removal is a soft-delete (`active = false`)
  so history and the audit log stay intact. Vehicles and drivers are two
  independent tables — a driver is never tied to one specific vehicle,
  they're paired fresh on each allocation.
- **Activity Log** (`/admin/activity`, admin only) — read-only feed of
  every submit, allocation, denial, cancellation, and fleet change, most
  recent first.
- **Transaction History** (`/transactions`, both roles) — admins see every
  requisition system-wide; staff see only their own. Includes an
  **Export allocations CSV** button covering every allocated (Scheduled /
  Active / Completed) requisition: S.no, requester, submitted by,
  department, origin, destination, allocation date, return date, vehicle
  reg/model, driver name/phone, status, and when it was allocated.
- **Messages** (`/messages`, both roles) — a single shared chatroom between
  staff and admins, polling every few seconds. Simple by design: one
  channel, no threads or DMs.

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
select record_login('Diana Achieng', 'user'); -- what the app calls on every login; updates last_login

-- Fleet
select add_vehicle('UBX 123A', 'Toyota Prado');
select remove_vehicle(3);                     -- soft-deletes; blocked if it has a Scheduled/Active trip
select add_driver('New Driver', '0700 000 004');
select remove_driver(3);

-- Requisition decisions (what the Allocate Vehicle / My Requests pages do)
select approve_requisition(12, 2, 1);         -- (requisition id, vehicle id, driver id)
select deny_requisition(12, 'No vehicles free that week');
select cancel_requisition(12, 'Diana Achieng'); -- pass null instead of a name to skip the ownership check
```

Denied requisitions show a `Denied` status (with the reason, if given) and
are excluded from the Pending Allocation list — the Allocate Vehicle page
also shows a "Recently denied" list for context. Cancelled requisitions
work the same way with a `Cancelled` status.

## Project structure

```
app/
  page.tsx                    Role-choice landing page
  login/user/page.tsx         Staff login (name only)
  login/admin/page.tsx        Admin login (name + PIN)
  dashboard/page.tsx          Availability + requisitions table (both roles)
  request/page.tsx            New Requisition form (staff)
  my-requests/page.tsx        Own requests + cancel (staff)
  admin/allocate/page.tsx     Allocate Vehicle — approve/deny (admin)
  admin/fleet/page.tsx        Manage Fleet (admin)
  admin/activity/page.tsx     Activity Log (admin)
  transactions/page.tsx       Transaction History + CSV export (both roles)
  messages/page.tsx           Shared chatroom (both roles)
  api/                        Backend — one route file per endpoint
lib/
  supabase.ts                 Server-side Supabase client (service role)
  data.ts                     All database queries (async)
  session.ts / auth.ts        Signed cookie session handling
  session-context.tsx         React context exposing the current session
  api.ts                      Client-side fetch wrappers used by the pages
  types.ts                    Shared TypeScript types
components/
  AppShell.tsx                Sidebar nav + session guard used by every page
  StatusBadge.tsx              Status pill (Pending/Scheduled/Active/Completed/Denied/Cancelled)
db/
  schema.sql                  Run this once in the Supabase SQL editor
```

## Notes

- The `status` field is never a value the app (or anyone) writes directly —
  Postgres can't express it as a generated column here (it depends on
  today's date, which isn't an immutable expression), so it's computed
  consistently in one place, `computeStatus()` in `lib/types.ts`, and
  mirrored in SQL by `requisition_status()` for browsing in the Supabase
  SQL editor. This is the same bug class that was fixed in the earlier
  Excel version — a blank/unassigned row can never silently read as
  available or scheduled.
- Vehicles and drivers are independent tables. A requisition links to one
  of each, but there is no vehicle-to-driver relationship anywhere in the
  schema — any driver can be paired with any vehicle on any allocation.
- Ownership (My Requests, cancelling, the "mine" scope on Transaction
  History) is keyed off `submitted_by`, the signed-in session name at
  submission time — never the editable `requester` field, and never
  anything sent by the client.
- Row Level Security is enabled on every table as defense-in-depth, but
  all access in this app goes through the server using the service-role
  key, which bypasses RLS by design — RLS matters if you ever expose the
  anon key to the browser directly.
- Messages are a single shared channel, not private DMs — anyone signed in
  can read and post. The chat and dashboard both use polling (every few
  seconds) rather than real-time push; wiring up Supabase Realtime would
  be the natural next step if you want instant delivery instead.
- To deploy, push this to Vercel (or any Node host) and set the same
  three env vars there. No further Supabase configuration is needed.
