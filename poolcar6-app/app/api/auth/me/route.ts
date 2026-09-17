import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";

// Lets the frontend restore a session after a page refresh instead of
// forcing a re-login every time (the signed cookie is already there).
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  return NextResponse.json({ session });
}
