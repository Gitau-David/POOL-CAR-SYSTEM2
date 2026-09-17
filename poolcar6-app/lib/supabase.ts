import { createClient } from "@supabase/supabase-js";

// Server-only client. Uses the SERVICE ROLE key so API routes can read/write
// freely — this file must never be imported into a "use client" component.
// Auth/authorization for this app is handled entirely by our own signed
// session cookie (see lib/session.ts), not by Supabase Auth or RLS.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
      "Copy .env.example to .env.local and fill in your Supabase project values."
  );
}

export const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
