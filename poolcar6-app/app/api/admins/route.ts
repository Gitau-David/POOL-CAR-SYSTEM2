import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { addAdmin, listAdminAccounts } from "@/lib/data";
import { hashPin } from "@/lib/session";

// IT-admin only: managing the other admins in the system.
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "it_admin") {
    return NextResponse.json({ error: "IT admin access required" }, { status: 403 });
  }
  const admins = await listAdminAccounts();
  return NextResponse.json({ admins });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "it_admin") {
    return NextResponse.json({ error: "IT admin access required" }, { status: 403 });
  }
  const { name, pin } = await req.json();
  if (!name || !pin) return NextResponse.json({ error: "name and pin are required" }, { status: 400 });
  const admin = await addAdmin(String(name).trim(), hashPin(String(pin)), session.name);
  return NextResponse.json({ admin }, { status: 201 });
}
