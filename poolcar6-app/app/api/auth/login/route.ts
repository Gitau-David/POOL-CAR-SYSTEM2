import { NextRequest, NextResponse } from "next/server";
import { encodeSession, hashPin } from "@/lib/session";
import { findAdminByName, recordLogin } from "@/lib/data";
import type { Role } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const roleChoice: "user" | "admin" = body.role;
  const name: string = (body.name || "").trim();

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  let role: Role;

  if (roleChoice === "admin") {
    // "Admin" on the login page covers both regular admins and the IT
    // admin tier — findAdminByName looks across both roles, and whichever
    // one the name+PIN actually matches is what the session becomes. Each
    // admin has their own PIN, hashed in the `users` table — no shared
    // env-var PIN. Deactivated admins (active = false) can't log in.
    const admin = await findAdminByName(name);
    if (!admin || !admin.active) {
      return NextResponse.json({ error: "No admin account with that name" }, { status: 401 });
    }
    if (hashPin(String(body.pin ?? "")) !== admin.pin_hash) {
      return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
    }
    role = admin.role;
  } else if (roleChoice === "user") {
    role = "user";
  } else {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Auto-registers staff on first login and updates last_login for
  // everyone — see record_login() in db/schema.sql. Best-effort: never
  // blocks an otherwise-successful login.
  await recordLogin(name, role);

  const token = encodeSession({ name, role });
  return NextResponse.json({ name, role, token });
}
