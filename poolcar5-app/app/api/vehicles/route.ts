import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { addVehicle, listVehicles } from "@/lib/data";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const vehicles = await listVehicles(false);
  return NextResponse.json({ vehicles });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const { reg_no, model } = await req.json();
  if (!reg_no || !model) return NextResponse.json({ error: "reg_no and model are required" }, { status: 400 });
  const vehicle = await addVehicle(reg_no, model);
  return NextResponse.json({ vehicle }, { status: 201 });
}
