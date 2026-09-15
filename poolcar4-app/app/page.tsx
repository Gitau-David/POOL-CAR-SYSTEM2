"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Car, User, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";

export default function RoleChoicePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api
      .me()
      .then((r) => {
        if (r.session) router.replace("/dashboard");
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  if (checking) {
    return <div className="flex h-screen items-center justify-center text-muted text-sm">Loading…</div>;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="h-11 w-11 rounded-xl bg-teal/15 flex items-center justify-center">
          <Car size={24} className="text-teal" />
        </div>
        <div>
          <div className="font-head font-semibold text-xl text-ink leading-tight">Pool Car Dispatch</div>
          <div className="text-sm text-muted leading-tight">Requisition &amp; allocation system</div>
        </div>
      </div>

      <p className="text-muted text-sm mt-6 mb-8">Continue as…</p>

      <div className="grid sm:grid-cols-2 gap-4 w-full max-w-lg">
        <button
          onClick={() => router.push("/login/user")}
          className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-8 text-center hover:border-teal/60 hover:bg-surface2 transition-colors"
        >
          <div className="h-12 w-12 rounded-xl bg-teal/15 flex items-center justify-center group-hover:bg-teal/25 transition-colors">
            <User size={22} className="text-teal" />
          </div>
          <div>
            <div className="font-head font-semibold text-ink">Staff</div>
            <div className="text-xs text-muted mt-1">Submit &amp; track vehicle requests</div>
          </div>
        </button>

        <button
          onClick={() => router.push("/login/admin")}
          className="group flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-8 text-center hover:border-amber/60 hover:bg-surface2 transition-colors"
        >
          <div className="h-12 w-12 rounded-xl bg-amber/15 flex items-center justify-center group-hover:bg-amber/25 transition-colors">
            <ShieldCheck size={22} className="text-amber" />
          </div>
          <div>
            <div className="font-head font-semibold text-ink">Admin</div>
            <div className="text-xs text-muted mt-1">Allocate vehicles &amp; manage fleet</div>
          </div>
        </button>
      </div>
    </div>
  );
}
