export type Role = "user" | "admin" | "it_admin";

export interface Vehicle {
  id: number;
  reg_no: string;
  model: string;
  active: boolean;
}

export interface Driver {
  id: number;
  name: string;
  phone: string | null;
  active: boolean;
}

export type RequisitionStatus = "Pending Allocation" | "Scheduled" | "Active" | "Completed" | "Denied" | "Cancelled";

/**
 * Mirrors requisition_status() in db/schema.sql exactly. Postgres can't
 * express this as a generated column (it depends on today's date, which
 * isn't immutable), so status is computed here instead — every read goes
 * through this one function, so it's still never something that can be set
 * directly on a row.
 */
export function computeStatus(params: {
  vehicleId: number | null;
  startDate: string;
  endDate: string;
  deniedAt?: string | null;
  cancelledAt?: string | null;
  today?: string;
}): RequisitionStatus {
  const { vehicleId, startDate, endDate, deniedAt = null, cancelledAt = null } = params;
  const today = params.today ?? new Date().toISOString().slice(0, 10);
  if (cancelledAt) return "Cancelled";
  if (deniedAt) return "Denied";
  if (vehicleId === null) return "Pending Allocation";
  if (today > endDate) return "Completed";
  if (today >= startDate) return "Active";
  return "Scheduled";
}

export interface Requisition {
  id: number;
  sno: number;
  requester: string;
  submitted_by: string | null;
  department: string;
  start_date: string;
  end_date: string;
  origin: string;
  destination: string;
  purpose: string | null;
  vehicle_id: number | null;
  driver_id: number | null;
  status: RequisitionStatus;
  created_at: string;
  allocated_at: string | null;
  denied_at: string | null;
  denial_reason: string | null;
  cancelled_at: string | null;
}

export interface Session {
  name: string;
  role: Role;
}

export interface AdminUser {
  id: number;
  name: string;
  role: "admin" | "it_admin";
  pin_hash: string;
  active: boolean;
  last_login: string | null;
}

export interface DirectoryUser {
  id: number;
  name: string;
  role: Role;
  last_login: string | null;
  created_at: string;
  active: boolean;
}

export interface ActivityLogEntry {
  id: number;
  requisition_id: number | null;
  actor_role: "user" | "admin" | "it_admin" | "system";
  actor_name: string | null;
  action: string;
  details: unknown;
  created_at: string;
  requisitions: { sno: number; requester: string } | null;
}

export interface Message {
  id: number;
  sender_name: string;
  sender_role: Role;
  body: string;
  created_at: string;
}
