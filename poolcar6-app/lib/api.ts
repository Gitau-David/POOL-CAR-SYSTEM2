import type {
  ActivityLogEntry,
  DirectoryUser,
  Driver,
  Message,
  Requisition,
  Role,
  Session,
  Vehicle,
} from "./types";

// The session token lives in sessionStorage, not a cookie — sessionStorage
// is isolated per browser tab (unlike cookies, which every tab shares), so
// logging in as a different person/role in another tab can't silently
// swap the session out from under this one. See lib/auth.ts for the
// server-side half of this.
const TOKEN_KEY = "poolcar_token";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

function setToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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
  me: () => fetch("/api/auth/me", { headers: authHeaders() }).then((r) => json<{ session: Session | null }>(r)),

  login: async (role: "user" | "admin", name: string, pin?: string) => {
    const result = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, name, pin }),
    }).then((r) => json<Session & { token: string }>(r));
    setToken(result.token);
    return result;
  },

  logout: async () => {
    clearToken();
    return fetch("/api/auth/logout", { method: "POST" }).then((r) => json<{ ok: true }>(r));
  },

  listRequisitions: () =>
    fetch("/api/requisitions", { headers: authHeaders() }).then((r) => json<{ requisitions: Requisition[] }>(r)),

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
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(input),
    }).then((r) => json<{ requisition: Requisition }>(r)),

  availability: (start: string, end: string) =>
    fetch(`/api/availability?start=${start}&end=${end}`, { headers: authHeaders() }).then((r) =>
      json<{ vehicles: Vehicle[]; drivers: Driver[] }>(r)
    ),

  allocate: (reqId: number, vehicleId: number, driverId: number) =>
    fetch(`/api/requisitions/${reqId}/allocate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ vehicleId, driverId }),
    }).then((r) => json<{ requisition: Requisition }>(r)),

  deny: (reqId: number, reason?: string) =>
    fetch(`/api/requisitions/${reqId}/deny`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ reason }),
    }).then((r) => json<{ requisition: Requisition }>(r)),

  cancelRequisition: (reqId: number) =>
    fetch(`/api/requisitions/${reqId}/cancel`, { method: "POST", headers: authHeaders() }).then((r) =>
      json<{ requisition: Requisition }>(r)
    ),

  listActivityLog: (date?: string) =>
    fetch(`/api/activity-log${date ? `?date=${date}` : ""}`, { headers: authHeaders() }).then((r) =>
      json<{ entries: ActivityLogEntry[] }>(r)
    ),

  deleteActivityLogEntry: (id: number) =>
    fetch(`/api/activity-log/${id}`, { method: "DELETE", headers: authHeaders() }).then((r) =>
      json<{ ok: true }>(r)
    ),

  listVehicles: (all = false) =>
    fetch(`/api/vehicles${all ? "?all=true" : ""}`, { headers: authHeaders() }).then((r) =>
      json<{ vehicles: Vehicle[] }>(r)
    ),

  addVehicle: (reg_no: string, model: string) =>
    fetch("/api/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ reg_no, model }),
    }).then((r) => json<{ vehicle: Vehicle }>(r)),

  removeVehicle: (id: number) =>
    fetch(`/api/vehicles/${id}`, { method: "DELETE", headers: authHeaders() }).then((r) => json<{ ok: true }>(r)),

  listDrivers: (all = false) =>
    fetch(`/api/drivers${all ? "?all=true" : ""}`, { headers: authHeaders() }).then((r) =>
      json<{ drivers: Driver[] }>(r)
    ),

  addDriver: (name: string, phone?: string) =>
    fetch("/api/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name, phone }),
    }).then((r) => json<{ driver: Driver }>(r)),

  removeDriver: (id: number) =>
    fetch(`/api/drivers/${id}`, { method: "DELETE", headers: authHeaders() }).then((r) => json<{ ok: true }>(r)),

  restoreDriver: (id: number) =>
    fetch(`/api/drivers/${id}/restore`, { method: "POST", headers: authHeaders() }).then((r) =>
      json<{ driver: Driver }>(r)
    ),

  listMessages: () => fetch("/api/messages", { headers: authHeaders() }).then((r) => json<{ messages: Message[] }>(r)),

  sendMessage: (body: string) =>
    fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ body }),
    }).then((r) => json<{ message: Message }>(r)),

  // ---- IT admin only ----
  listAdmins: () => fetch("/api/admins", { headers: authHeaders() }).then((r) => json<{ admins: DirectoryUser[] }>(r)),

  addAdmin: (name: string, pin: string) =>
    fetch("/api/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ name, pin }),
    }).then((r) => json<{ admin: DirectoryUser }>(r)),

  removeAdmin: (id: number) =>
    fetch(`/api/admins/${id}`, { method: "DELETE", headers: authHeaders() }).then((r) => json<{ ok: true }>(r)),

  listDirectory: () =>
    fetch("/api/directory", { headers: authHeaders() }).then((r) => json<{ people: DirectoryUser[] }>(r)),
};
