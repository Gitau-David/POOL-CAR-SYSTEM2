import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { addDriver, listDrivers } from "@/lib/data";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const drivers = await listDrivers(false);
  return NextResponse.json({ drivers });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { name, phone } = await req.json();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const driver = await addDriver(name, phone);
  return NextResponse.json({ driver }, { status: 201 });
}
