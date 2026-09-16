import type { ActivityLogEntry, Driver, Message, Requisition, Role, Session, Vehicle } from "./types";

async function json<T>(res: Response): Promise<T> {
  // Read as text first — calling res.json() directly throws a cryptic
  // "Unexpected end of JSON input" whenever a response body is empty (e.g.
  // a network hiccup, an aborted request, or a route that returned no
  // body), which is confusing to see as a user-facing error. Parsing text
  // ourselves lets us fail with a clear message instead.
  const text = await res.text();
  let body: any = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: "The server sent back an unreadable response. Please try again." };
    }
  } else if (!res.ok) {
    body = { error: `Request failed (${res.status})` };
  }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

export const api = {
  me: () => fetch("/api/auth/me").then((r) => json<{ session: Session | null }>(r)),

  login: (role: Role, name: string, pin?: string) =>
    fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, name, pin }),
    }).then((r) => json<Session>(r)),

  logout: () => fetch("/api/auth/logout", { method: "POST" }).then((r) => json<{ ok: true }>(r)),

  listRequisitions: () =>
    fetch("/api/requisitions").then((r) => json<{ requisitions: Requisition[] }>(r)),

  createRequisition: (input: {
    requester: string;
    department: string;
    start_date: string;
    end_date: string;
    origin: string;
    destination: string;
    purpose?: string;
  }) =>
    fetch("/api/requisitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => json<{ requisition: Requisition }>(r)),

  availability: (start: string, end: string) =>
    fetch(`/api/availability?start=${start}&end=${end}`).then((r) =>
      json<{ vehicles: Vehicle[]; drivers: Driver[] }>(r)
    ),

  allocate: (reqId: number, vehicleId: number, driverId: number) =>
    fetch(`/api/requisitions/${reqId}/allocate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId, driverId }),
    }).then((r) => json<{ requisition: Requisition }>(r)),

  deny: (reqId: number, reason?: string) =>
    fetch(`/api/requisitions/${reqId}/deny`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }).then((r) => json<{ requisition: Requisition }>(r)),

  cancelRequisition: (reqId: number) =>
    fetch(`/api/requisitions/${reqId}/cancel`, { method: "POST" }).then((r) =>
      json<{ requisition: Requisition }>(r)
    ),

  listActivityLog: () => fetch("/api/activity-log").then((r) => json<{ entries: ActivityLogEntry[] }>(r)),

  listVehicles: () => fetch("/api/vehicles").then((r) => json<{ vehicles: Vehicle[] }>(r)),

  addVehicle: (reg_no: string, model: string) =>
    fetch("/api/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reg_no, model }),
    }).then((r) => json<{ vehicle: Vehicle }>(r)),

  removeVehicle: (id: number) =>
    fetch(`/api/vehicles/${id}`, { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),

  listDrivers: () => fetch("/api/drivers").then((r) => json<{ drivers: Driver[] }>(r)),

  addDriver: (name: string, phone?: string) =>
    fetch("/api/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone }),
    }).then((r) => json<{ driver: Driver }>(r)),

  removeDriver: (id: number) =>
    fetch(`/api/drivers/${id}`, { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),

  listMessages: () => fetch("/api/messages").then((r) => json<{ messages: Message[] }>(r)),

  sendMessage: (body: string) =>
    fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }).then((r) => json<{ message: Message }>(r)),
};
