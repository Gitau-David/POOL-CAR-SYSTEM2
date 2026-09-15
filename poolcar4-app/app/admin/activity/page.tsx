"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import type { ActivityLogEntry } from "@/lib/types";

const ACTION_LABEL: Record<string, string> = {
  submitted: "Requisition submitted",
  allocated: "Vehicle allocated",
  denied: "Request denied",
  cancelled: "Request cancelled",
  vehicle_added: "Vehicle added",
  vehicle_removed: "Vehicle removed",
  driver_added: "Driver added",
  driver_removed: "Driver removed",
  admin_added: "Admin account added",
};

function describeDetails(action: string, details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;
  switch (action) {
    case "denied":
      return d.reason ? `Reason: ${d.reason}` : null;
    case "vehicle_added":
      return d.reg_no ? `${d.reg_no} — ${d.model ?? ""}`.trim() : null;
    case "driver_added":
      return typeof d.name === "string" ? d.name : null;
    case "allocated":
      return d.vehicleId ? `Vehicle #${d.vehicleId}, driver #${d.driverId}` : null;
    default:
      return null;
  }
}

export default function ActivityLogPage() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listActivityLog()
      .then((r) => setEntries(r.entries))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <div className="mb-7">
        <h1 className="font-head font-semibold text-xl text-ink">Activity Log</h1>
        <p className="text-sm text-muted mt-1">
          Every submit, allocation, denial, cancellation, and fleet change — most recent first.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted">No activity recorded yet.</p>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Requisition</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-ink capitalize">{e.actor_role}</td>
                  <td className="px-4 py-3 text-ink">{ACTION_LABEL[e.action] ?? e.action}</td>
                  <td className="px-4 py-3 font-mono text-muted">
                    {e.requisitions ? `#${e.requisitions.sno} — ${e.requisitions.requester}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">{describeDetails(e.action, e.details) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
