import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { isAdminLike } from "@/lib/require-admin";
import { addVehicle, listVehicles } from "@/lib/data";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // Removed vehicles are soft-deleted (active = false) so history stays
  // intact, but they should disappear from every normal list — otherwise
  // "removing" one looks like it did nothing. Only an explicit ?all=true
  // from an admin/it_admin sees inactive rows too (Manage Fleet's
  // "show removed" section).
  const includeInactive = req.nextUrl.searchParams.get("all") === "true" && isAdminLike(session);
  const vehicles = await listVehicles(!includeInactive);
  return NextResponse.json({ vehicles });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!isAdminLike(session)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { reg_no, model } = await req.json();
  if (!reg_no || !model) return NextResponse.json({ error: "reg_no and model are required" }, { status: 400 });
  const vehicle = await addVehicle(reg_no, model, session.name);
  return NextResponse.json({ vehicle }, { status: 201 });
}
