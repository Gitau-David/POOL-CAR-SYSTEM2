import type { Session } from "./types";

/** True for both regular admins and the IT admin tier. Also narrows the type, so callers don't need a `session!` afterward. */
export function isAdminLike(session: Session | null): session is Session {
  return !!session && (session.role === "admin" || session.role === "it_admin");
}
