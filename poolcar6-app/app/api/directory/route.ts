import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { listDirectory } from "@/lib/data";

// IT-admin only: everyone who has ever logged in, any role, with last_login
// — deliberately excludes pin_hash, which is never sent to the client.
export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "it_admin") {
    return NextResponse.json({ error: "IT admin access required" }, { status: 403 });
  }
  const people = await listDirectory();
  return NextResponse.json({ people });
}
