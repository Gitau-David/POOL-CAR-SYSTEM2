import { NextRequest, NextResponse } from "next/server";
import { encodeSession, SESSION_COOKIE, SESSION_MAX_AGE, hashPin } from "@/lib/session";
import { findAdminByName, recordLogin } from "@/lib/data";
import type { Role } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const role: Role = body.role;
  const name: string = (body.name || "").trim();

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  if (role === "admin") {
    // Each admin has their own PIN, hashed in the `users` table — no shared
    // env-var PIN anymore. Add admin accounts via db/schema.sql or the
    // seed pattern in the README.
    const admin = await findAdminByName(name);
    if (!admin) {
      return NextResponse.json({ error: "No admin account with that name" }, { status: 401 });
    }
    if (hashPin(String(body.pin ?? "")) !== admin.pin_hash) {
      return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
    }
  } else if (role !== "user") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Auto-registers staff on first login and updates last_login for both
  // roles — see record_login() in db/schema.sql. Best-effort: never blocks
  // an otherwise-successful login.
  await recordLogin(name, role);

  const token = encodeSession({ name, role });
  const res = NextResponse.json({ name, role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
