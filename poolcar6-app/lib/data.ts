import { supabase } from "./supabase";
import type { Vehicle, Driver, Requisition, Role, AdminUser, ActivityLogEntry, Message, DirectoryUser } from "./types";
import { computeStatus } from "./types";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Attach the computed status field to a raw requisitions row (see computeStatus in lib/types.ts). */
function withStatus(row: any): Requisition {
  return {
    ...row,
    status: computeStatus({
      vehicleId: row.vehicle_id,
      startDate: row.start_date,
      endDate: row.end_date,
      deniedAt: row.denied_at,
      cancelledAt: row.cancelled_at,
    }),
  };
}

// ---------------- admin accounts ----------------
// Each admin has their own PIN (hashed) stored in the `users` table, rather
// than one shared PIN — see lib/session.ts hashPin() for the hashing used.
// Covers both regular admins and the IT admin tier; the caller decides what
// to do with whichever role comes back. Excludes deactivated accounts.
export async function findAdminByName(name: string): Promise<AdminUser | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .in("role", ["admin", "it_admin"])
    .eq("active", true)
    .ilike("name", name.trim())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AdminUser) ?? null;
}

/** IT Admin page: every admin + it_admin account, active or not. */
export async function listAdminAccounts(): Promise<DirectoryUser[]> {
  const { data, error } = await supabase
    .from("users")
    .select("id,name,role,last_login,created_at,active")
    .in("role", ["admin", "it_admin"])
    .order("role")
    .order("name");
  if (error) throw new Error(error.message);
  return data as DirectoryUser[];
}

export async function addAdmin(name: string, pinHash: string, actorName: string | null): Promise<AdminUser> {
  const { data, error } = await supabase
    .from("users")
    .insert({ name: name.trim(), role: "admin", pin_hash: pinHash })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await logActivity(null, "it_admin", actorName, "admin_added", { name });
  return data as AdminUser;
}

/** Soft-deactivates a regular admin (never an it_admin) — mirrors remove_admin() in db/schema.sql. */
export async function removeAdmin(id: number, actorName: string | null): Promise<{ ok: boolean; reason?: string }> {
  const { data, error } = await supabase
    .from("users")
    .update({ active: false })
    .eq("id", id)
    .eq("role", "admin")
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ok: false, reason: "No admin with that id" };
  await logActivity(null, "it_admin", actorName, "admin_removed", { id, name: data.name });
  return { ok: true };
}

/** IT Admin page's people directory — everyone who has ever logged in, any role. */
export async function listDirectory(): Promise<DirectoryUser[]> {
  const { data, error } = await supabase
    .from("users")
    .select("id,name,role,last_login,created_at,active")
    .order("role")
    .order("name");
  if (error) throw new Error(error.message);
  return data as DirectoryUser[];
}

export async function logActivity(
  requisitionId: number | null,
  actorRole: Role | "system",
  actorName: string | null,
  action: string,
  details?: unknown
) {
  const { error } = await supabase.from("activity_log").insert({
    requisition_id: requisitionId,
    actor_role: actorRole,
    actor_name: actorName,
    action,
    details: details ?? null,
  });
  if (error) console.error("logActivity failed:", error.message);
}

/** Admin Activity Log page — most recent first, with the related requisition's S.no/requester embedded. */
export async function listActivityLog(date?: string, limit = 500): Promise<ActivityLogEntry[]> {
  let query = supabase.from("activity_log").select("*, requisitions(sno, requester)");
  if (date) {
    // date is a plain YYYY-MM-DD from the UI's date picker — treat it as a
    // whole-day window in the server's local calendar.
    const start = `${date}T00:00:00.000Z`;
    const end = `${date}T23:59:59.999Z`;
    query = query.gte("created_at", start).lte("created_at", end);
  }
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ActivityLogEntry[];
}

export async function deleteActivityLogEntry(id: number): Promise<void> {
  const { error } = await supabase.from("activity_log").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------- vehicles ----------------
export async function listVehicles(activeOnly = true): Promise<Vehicle[]> {
  let query = supabase.from("vehicles").select("*").order("reg_no");
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as Vehicle[];
}

export async function addVehicle(reg_no: string, model: string, actorName: string | null): Promise<Vehicle> {
  // Upsert on reg_no: adding back a previously-removed vehicle by the same
  // reg number reactivates it (and updates its model) instead of failing
  // on the unique constraint.
  const { data, error } = await supabase
    .from("vehicles")
    .upsert({ reg_no, model, active: true }, { onConflict: "reg_no" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await logActivity(null, "admin", actorName, "vehicle_added", { reg_no, model });
  return data as Vehicle;
}

export async function restoreDriver(id: number, actorName: string | null): Promise<Driver> {
  const { data, error } = await supabase.from("drivers").update({ active: true }).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  await logActivity(null, "admin", actorName, "driver_restored", { id });
  return data as Driver;
}

export async function removeVehicle(
  id: number,
  actorName: string | null
): Promise<{ ok: boolean; reason?: string }> {
  // "Scheduled or Active" == has this vehicle assigned, isn't denied/cancelled, and isn't over yet.
  // (Status isn't a DB column — see the note in db/schema.sql — so this is
  // the same check expressed directly as a date filter.)
  const { data: inUse, error: checkErr } = await supabase
    .from("requisitions")
    .select("id")
    .eq("vehicle_id", id)
    .is("cancelled_at", null)
    .gte("end_date", todayISO())
    .limit(1);
  if (checkErr) throw new Error(checkErr.message);
  if (inUse && inUse.length > 0) {
    return { ok: false, reason: "Vehicle has a scheduled or active trip" };
  }
  const { error } = await supabase.from("vehicles").update({ active: false }).eq("id", id);
  if (error) throw new Error(error.message);
  await logActivity(null, "admin", actorName, "vehicle_removed", { id });
  return { ok: true };
}

// ---------------- drivers ----------------
export async function listDrivers(activeOnly = true): Promise<Driver[]> {
  let query = supabase.from("drivers").select("*").order("name");
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as Driver[];
}

export async function addDriver(name: string, phone: string | undefined, actorName: string | null): Promise<Driver> {
  const { data, error } = await supabase
    .from("drivers")
    .insert({ name, phone: phone ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await logActivity(null, "admin", actorName, "driver_added", { name });
  return data as Driver;
}

export async function removeDriver(
  id: number,
  actorName: string | null
): Promise<{ ok: boolean; reason?: string }> {
  const { data: inUse, error: checkErr } = await supabase
    .from("requisitions")
    .select("id")
    .eq("driver_id", id)
    .is("cancelled_at", null)
    .gte("end_date", todayISO())
    .limit(1);
  if (checkErr) throw new Error(checkErr.message);
  if (inUse && inUse.length > 0) {
    return { ok: false, reason: "Driver has a scheduled or active trip" };
  }
  const { error } = await supabase.from("drivers").update({ active: false }).eq("id", id);
  if (error) throw new Error(error.message);
  await logActivity(null, "admin", actorName, "driver_removed", { id });
  return { ok: true };
}

// ---------------- requisitions ----------------
export async function listRequisitions(): Promise<Requisition[]> {
  const { data, error } = await supabase.from("requisitions").select("*").order("sno");
  if (error) throw new Error(error.message);
  return (data ?? []).map(withStatus);
}

export async function getRequisition(id: number): Promise<Requisition | undefined> {
  const { data, error } = await supabase.from("requisitions").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? withStatus(data) : undefined;
}

export interface NewRequisitionInput {
  requester: string;
  submittedBy: string;
  department: string;
  start_date: string;
  end_date: string;
  origin: string;
  destination: string;
  purpose?: string;
}

export async function createRequisition(input: NewRequisitionInput): Promise<Requisition> {
  const { submittedBy, ...rest } = input;
  // sno is an identity column, so Postgres assigns it automatically — we just insert.
  const { data, error } = await supabase
    .from("requisitions")
    .insert({ ...rest, submitted_by: submittedBy, purpose: input.purpose ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const req = withStatus(data);
  await logActivity(req.id, "user", submittedBy, "submitted", { sno: req.sno });
  return req;
}

/** The System's automatic availability check — mirrors the flowchart's "Checks availability" step. */
export async function availableFor(
  start: string,
  end: string
): Promise<{ vehicles: Vehicle[]; drivers: Driver[] }> {
  // Any requisition whose date range overlaps [start, end] holds its vehicle/driver busy —
  // unless that requisition was denied or cancelled, in which case it never happened.
  const { data: overlapping, error } = await supabase
    .from("requisitions")
    .select("vehicle_id, driver_id")
    .is("denied_at", null)
    .is("cancelled_at", null)
    .lte("start_date", end)
    .gte("end_date", start);
  if (error) throw new Error(error.message);

  const busyVehicleIds = new Set((overlapping ?? []).map((r) => r.vehicle_id).filter(Boolean));
  const busyDriverIds = new Set((overlapping ?? []).map((r) => r.driver_id).filter(Boolean));

  const [vehicles, drivers] = await Promise.all([listVehicles(), listDrivers()]);
  return {
    vehicles: vehicles.filter((v) => !busyVehicleIds.has(v.id)),
    drivers: drivers.filter((d) => !busyDriverIds.has(d.id)),
  };
}

export async function allocate(
  reqId: number,
  vehicleId: number,
  driverId: number,
  actorName: string | null
): Promise<{ ok: boolean; reason?: string; requisition?: Requisition }> {
  const req = await getRequisition(reqId);
  if (!req) return { ok: false, reason: "Requisition not found" };
  if (req.cancelled_at) return { ok: false, reason: "Requisition was cancelled" };
  if (req.denied_at) return { ok: false, reason: "Requisition was already denied" };
  if (req.vehicle_id !== null) return { ok: false, reason: "Already allocated" };

  // Final server-side conflict check — never trust the client's earlier read.
  const { vehicles, drivers } = await availableFor(req.start_date, req.end_date);
  if (!vehicles.some((v) => v.id === vehicleId)) {
    return { ok: false, reason: "Vehicle no longer available for these dates" };
  }
  if (!drivers.some((d) => d.id === driverId)) {
    return { ok: false, reason: "Driver no longer available for these dates" };
  }

  const { data, error } = await supabase
    .from("requisitions")
    .update({ vehicle_id: vehicleId, driver_id: driverId, allocated_at: new Date().toISOString() })
    .eq("id", reqId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await logActivity(reqId, "admin", actorName, "allocated", { vehicleId, driverId });
  return { ok: true, requisition: withStatus(data) };
}

export async function denyRequisition(
  reqId: number,
  reason: string | undefined,
  actorName: string | null
): Promise<{ ok: boolean; reason?: string; requisition?: Requisition }> {
  const req = await getRequisition(reqId);
  if (!req) return { ok: false, reason: "Requisition not found" };
  if (req.cancelled_at) return { ok: false, reason: "Requisition was cancelled" };
  if (req.vehicle_id !== null) return { ok: false, reason: "Already allocated, cannot deny" };
  if (req.denied_at) return { ok: false, reason: "Already denied" };

  const { data, error } = await supabase
    .from("requisitions")
    .update({ denied_at: new Date().toISOString(), denial_reason: reason ?? null })
    .eq("id", reqId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await logActivity(reqId, "admin", actorName, "denied", { reason });
  return { ok: true, requisition: withStatus(data) };
}

/**
 * A staff member cancelling their own request. `submittedByName` is the
 * signed-in session's name, matched case-insensitively against the
 * requisition's `submitted_by` field (falling back to `requester` for rows
 * from before that column existed) — `requester` itself is editable free
 * text now, so it's no longer trusted for ownership. Admins/IT admins can
 * cancel any request (isAdmin = true); actorRole is recorded as-is in the
 * activity log so an IT admin's cancellation shows up as 'it_admin', not
 * a generic 'admin'.
 */
export async function cancelRequisition(
  reqId: number,
  submittedByName: string,
  isAdmin: boolean,
  actorRole: Role
): Promise<{ ok: boolean; reason?: string; requisition?: Requisition }> {
  const req = await getRequisition(reqId);
  if (!req) return { ok: false, reason: "Requisition not found" };
  const owner = (req.submitted_by || req.requester).trim().toLowerCase();
  if (!isAdmin && owner !== submittedByName.trim().toLowerCase()) {
    return { ok: false, reason: "You can only cancel your own requests" };
  }
  if (req.status !== "Pending Allocation" && req.status !== "Scheduled") {
    return { ok: false, reason: `Cannot cancel a request that is ${req.status}` };
  }

  const { data, error } = await supabase
    .from("requisitions")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", reqId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await logActivity(reqId, actorRole, submittedByName, "cancelled", {});
  return { ok: true, requisition: withStatus(data) };
}

// ---------------- login tracking ----------------
// Records last_login for admins, and auto-registers + tracks staff on their
// first (and every) login — see record_login() in db/schema.sql. Best-effort:
// a failure here shouldn't block someone from actually signing in.
export async function recordLogin(name: string, role: Role): Promise<void> {
  const { error } = await supabase.rpc("record_login", { p_name: name, p_role: role });
  if (error) console.error("recordLogin failed:", error.message);
}

// ---------------- messages (shared chatroom) ----------------
export async function listMessages(limit = 200): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Message[]).reverse();
}

export async function sendMessage(senderName: string, senderRole: Role, body: string): Promise<Message> {
  const { data, error } = await supabase
    .from("messages")
    .insert({ sender_name: senderName, sender_role: senderRole, body: body.trim() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Message;
}
