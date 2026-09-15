"use client";

import { createContext, useContext } from "react";
import type { Session } from "./types";

export const SessionContext = createContext<Session | null>(null);

/** Session of the signed-in user — always non-null inside AppShell's children. */
export function useSession(): Session | null {
  return useContext(SessionContext);
}
