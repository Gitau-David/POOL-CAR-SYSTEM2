"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FilePlus2,
  ClipboardCheck,
  Truck,
  LogOut,
  Car,
  ListChecks,
  ScrollText,
  History,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Session, Role } from "@/lib/types";
import { SessionContext } from "@/lib/session-context";

// Role separation lives here: staff can request/track their own trips,
// admins run allocation, fleet, and the audit trail, and the IT admin tier
// gets everything admins get plus admin-account management. Dashboard,
// Transaction History, and Messages are shared by every role.
type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: readonly Role[];
};

const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["user", "admin", "it_admin"] },
    ],
  },
  {
    label: "Requests",
    items: [
      { href: "/request", label: "New Requisition", icon: FilePlus2, roles: ["user"] },
      { href: "/my-requests", label: "My Requests", icon: ListChecks, roles: ["user"] },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/admin/allocate", label: "Allocate Vehicle", icon: ClipboardCheck, roles: ["admin", "it_admin"] },
      { href: "/admin/fleet", label: "Manage Fleet", icon: Truck, roles: ["admin", "it_admin"] },
      { href: "/admin/activity", label: "Activity Log", icon: ScrollText, roles: ["admin", "it_admin"] },
    ],
  },
  {
    label: "IT Admin",
    items: [{ href: "/admin/it", label: "Admins & Directory", icon: ShieldCheck, roles: ["it_admin"] }],
  },
  {
    label: "Records",
    items: [
      { href: "/transactions", label: "Transaction History", icon: History, roles: ["user", "admin", "it_admin"] },
      { href: "/messages", label: "Messages", icon: MessageSquare, roles: ["user", "admin", "it_admin"] },
    ],
  },
];

const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null | "loading">("loading");

  useEffect(() => {
    api
      .me()
      .then((r) => {
        if (!r.session) {
          router.replace("/");
        } else {
          setSession(r.session);
        }
      })
      .catch(() => router.replace("/"));
  }, [router]);

  // Enforce role separation client-side too (the API routes enforce it
  // server-side either way, so this is just for a clean redirect instead of
  // a page full of 403s).
  useEffect(() => {
    if (!session || session === "loading") return;
    const allowedHere = NAV.some(
      (item) => (item.roles as readonly string[]).includes(session.role) && pathname.startsWith(item.href)
    );
    if (!allowedHere && pathname !== "/dashboard") {
      router.replace("/dashboard");
    }
  }, [session, pathname, router]);

  if (session === "loading") {
    return (
      <div className="flex h-screen items-center justify-center text-muted text-sm">
        Loading…
      </div>
    );
  }
  if (!session) return null; // redirecting

  async function handleLogout() {
    await api.logout();
    router.replace("/");
  }

  return (
    <SessionContext.Provider value={session}>
      <div className="flex min-h-screen">
        <aside className="w-64 shrink-0 border-r border-border bg-surface flex flex-col">
          <div className="flex items-center gap-2 px-5 py-5 border-b border-border">
            <div className="h-8 w-8 rounded-lg bg-teal/15 flex items-center justify-center">
              <Car size={18} className="text-teal" />
            </div>
            <div>
              <div className="font-head font-semibold text-sm text-ink leading-tight">Pool Car</div>
              <div className="text-[11px] text-muted leading-tight">Dispatch</div>
            </div>
          </div>

          <nav className="flex-1 px-3 py-5 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-5">
              {NAV_GROUPS.map((group) => {
                const items = group.items.filter((item) =>
                  (item.roles as readonly string[]).includes(session.role)
                );
                if (items.length === 0) return null;
                return (
                  <div key={group.label ?? "top"}>
                    {group.label && (
                      <div className="px-3 mb-1.5 text-[10px] font-medium text-muted/70 uppercase tracking-wider">
                        {group.label}
                      </div>
                    )}
                    <div className="space-y-1">
                      {items.map((item) => {
                        const active = pathname === item.href;
                        const Icon = item.icon;
                        return (
                          <button
                            key={item.href}
                            onClick={() => router.push(item.href)}
                            className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                              active
                                ? "bg-surface2 text-ink font-medium"
                                : "text-muted hover:bg-surface2/60 hover:text-ink"
                            }`}
                          >
                            <Icon size={16} />
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </nav>

          <div className="px-3 py-4 border-t border-border">
            <div className="px-3 pb-3">
              <div className="text-sm text-ink font-medium truncate">{session.name}</div>
              <div className="text-[11px] text-muted uppercase tracking-wide">{session.role}</div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted hover:bg-red/10 hover:text-red transition-colors"
            >
              <LogOut size={16} />
              Log out
            </button>
          </div>
        </aside>

        <main className="flex-1 px-8 py-7 overflow-y-auto">{children}</main>
      </div>
    </SessionContext.Provider>
  );
}
