import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { isAdminLike } from "@/lib/require-admin";
import { allocate } from "@/lib/data";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSessionFromRequest(req);
  if (!isAdminLike(session)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { vehicleId, driverId } = body;
  if (!vehicleId || !driverId) {
    return NextResponse.json({ error: "vehicleId and driverId are required" }, { status: 400 });
  }

  const result = await allocate(Number(params.id), Number(vehicleId), Number(driverId), session.name);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ requisition: result.requisition });
}
