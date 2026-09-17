"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import type { ActivityLogEntry } from "@/lib/types";
import { Printer, Trash2 } from "lucide-react";

const ACTION_LABEL: Record<string, string> = {
  login: "Logged in",
  submitted: "Requisition submitted",
  allocated: "Vehicle allocated",
  denied: "Request denied",
  cancelled: "Request cancelled",
  vehicle_added: "Vehicle added",
  vehicle_removed: "Vehicle removed",
  driver_added: "Driver added",
  driver_removed: "Driver removed",
  driver_restored: "Driver restored",
  admin_added: "Admin account added",
  admin_removed: "Admin account removed",
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
    case "admin_added":
    case "admin_removed":
      return typeof d.name === "string" ? d.name : null;
    case "allocated":
      return d.vehicleId ? `Vehicle #${d.vehicleId}, driver #${d.driverId}` : null;
    default:
      return null;
  }
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function ActivityLogPage() {
  const [date, setDate] = useState(todayISO());
  const [showAllDates, setShowAllDates] = useState(true);
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.listActivityLog(showAllDates ? undefined : date);
      setEntries(r.entries);
    } catch (err: any) {
      setError(err.message || "Could not load the activity log.");
    } finally {
      setLoading(false);
    }
  }, [date, showAllDates]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: number) {
    setError("");
    setBusyId(id);
    try {
      await api.deleteActivityLogEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err: any) {
      setError(err.message || "Could not delete that entry.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell>
      <div className="mb-7 flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="font-head font-semibold text-xl text-ink">Activity Log</h1>
          <p className="text-sm text-muted mt-1">
            Every login, submit, allocation, denial, cancellation, and fleet change — most recent first.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={showAllDates}
              onChange={(e) => setShowAllDates(e.target.checked)}
              className="accent-teal"
            />
            All dates
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={showAllDates}
            className="rounded-lg bg-surface2 border border-border px-3 py-2 text-sm text-ink outline-none focus:border-teal/60 disabled:opacity-40"
          />
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-lg border border-border text-ink text-sm px-3 py-2 hover:bg-surface2 transition-colors"
          >
            <Printer size={15} />
            Print
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-red mb-4 print:hidden">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted">
          {showAllDates ? "No activity recorded yet." : `No activity recorded on ${date}.`}
        </p>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Who</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Requisition</th>
                <th className="px-4 py-3 font-medium">Details</th>
                <th className="px-4 py-3 font-medium print:hidden"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-muted whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-ink">{e.actor_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted capitalize">{e.actor_role.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-ink">{ACTION_LABEL[e.action] ?? e.action}</td>
                  <td className="px-4 py-3 font-mono text-muted">
                    {e.requisitions ? `#${e.requisitions.sno} — ${e.requisitions.requester}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">{describeDetails(e.action, e.details) ?? "—"}</td>
                  <td className="px-4 py-3 print:hidden">
                    <button
                      onClick={() => handleDelete(e.id)}
                      disabled={busyId === e.id}
                      className="text-muted hover:text-red transition-colors disabled:opacity-50"
                      aria-label="Delete entry"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
