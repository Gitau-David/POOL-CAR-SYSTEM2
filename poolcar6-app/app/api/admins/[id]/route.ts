import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { removeAdmin } from "@/lib/data";

// IT-admin only. Deactivates a regular admin — never touches other IT
// admins (enforced in lib/data.ts's removeAdmin, which only matches
// role = 'admin').
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSessionFromRequest(req);
  if (!session || session.role !== "it_admin") {
    return NextResponse.json({ error: "IT admin access required" }, { status: 403 });
  }
  const result = await removeAdmin(Number(params.id), session.name);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ ok: true });
}
