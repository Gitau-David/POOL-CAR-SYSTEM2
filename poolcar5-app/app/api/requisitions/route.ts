import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { createRequisition, listRequisitions } from "@/lib/data";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const requisitions = await listRequisitions();
  return NextResponse.json({ requisitions });
}

export async function POST(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.role !== "user") {
    return NextResponse.json({ error: "Only staff accounts can submit requisitions" }, { status: 403 });
  }

  const body = await req.json();
  const required = ["requester", "department", "start_date", "end_date", "origin", "destination"];
  for (const field of required) {
    if (!body[field]) return NextResponse.json({ error: `Missing field: ${field}` }, { status: 400 });
  }
  if (body.start_date > body.end_date) {
    return NextResponse.json({ error: "End date must be on or after start date" }, { status: 400 });
  }

  const requisition = await createRequisition({
    // Editable: who the trip is actually for (may differ from who's filing it).
    requester: body.requester,
    // Never client-supplied: the signed-in staff member's own name — this is
    // what "cancel my request" is authorized against, so it can't be spoofed.
    submittedBy: session.name,
    department: body.department,
    start_date: body.start_date,
    end_date: body.end_date,
    origin: body.origin,
    destination: body.destination,
    purpose: body.purpose,
  });
  return NextResponse.json({ requisition }, { status: 201 });
}
