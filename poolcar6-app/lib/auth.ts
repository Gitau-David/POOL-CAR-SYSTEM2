import type { NextRequest } from "next/server";
import { decodeSession } from "./session";
import type { Session } from "./types";

/**
 * Reads the session from the Authorization header, not a cookie.
 *
 * Why: a cookie is shared by every tab in the browser. With this app's
 * "choose a role, then log in" flow, that meant logging in as Admin in one
 * tab silently swapped the session out from under a User tab open right
 * next to it — the next time that tab re-checked its session (e.g. on
 * navigating to a new page), it would suddenly see the other tab's role
 * and jump to match it. sessionStorage is isolated per tab (unlike
 * localStorage or cookies), so each tab keeps its own token and its own
 * identity — see lib/api.ts for the client side of this.
 */
export function getSessionFromRequest(req: NextRequest): Session | null {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  return decodeSession(token);
}
