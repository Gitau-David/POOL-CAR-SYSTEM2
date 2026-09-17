import { NextResponse } from "next/server";

// Sessions are stateless signed tokens held client-side in sessionStorage
// now, not a server cookie, so there's nothing to invalidate here — the
// client just discards its token (see lib/api.ts logout()).
export async function POST() {
  return NextResponse.json({ ok: true });
}
