import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { isAdminLike } from "@/lib/require-admin";
import { listActivityLog } from "@/lib/data";

export async function GET(req: NextRequest) {
  const session = getSessionFromRequest(req);
  if (!isAdminLike(session)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }
  const date = req.nextUrl.searchParams.get("date") || undefined;
  const entries = await listActivityLog(date ?? undefined);
  return NextResponse.json({ entries });
}
