import crypto from "crypto";
import type { Session } from "./types";

// Signed, stateless session cookie (HMAC-SHA256) — no external auth library
// and no Supabase Auth. This matches the build spec: staff log in with just
// a name, admins with a name + PIN, and role is always re-derived
// server-side from this signed cookie, never trusted from the client.
const SECRET = process.env.SESSION_SECRET || "dev-only-secret-change-me";
export const SESSION_COOKIE = "poolcar_session";
export const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin).digest("hex");
}

export function encodeSession(session: Session): string {
  const payload = Buffer.from(
    JSON.stringify({ ...session, exp: Date.now() + SESSION_MAX_AGE * 1000 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined | null): Session | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (sign(payload) !== sig) return null; // tampered or wrong secret
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (typeof data.exp === "number" && data.exp < Date.now()) return null; // expired
    return { name: data.name, role: data.role };
  } catch {
    return null;
  }
}
