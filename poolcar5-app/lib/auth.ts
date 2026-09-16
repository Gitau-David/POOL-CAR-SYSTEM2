import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, decodeSession } from "./session";
import type { Session } from "./types";

/** Read + verify the session inside a Server Component or route handler (no request object). */
export function getSession(): Session | null {
  const value = cookies().get(SESSION_COOKIE)?.value;
  return decodeSession(value);
}

/** Read + verify the session inside an API route handler that has a NextRequest. */
export function getSessionFromRequest(req: NextRequest): Session | null {
  const value = req.cookies.get(SESSION_COOKIE)?.value;
  return decodeSession(value);
}
