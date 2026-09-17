"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import AppShell from "@/components/AppShell";
import StatusBadge from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session-context";
import type { Requisition, Vehicle, Driver } from "@/lib/types";
import { Download } from "lucide-react";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function totalDays(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24)) + 1;
}

export default function TransactionsPage() {
  const session = useSession();
  const isAdminLike = session?.role === "admin" || session?.role === "it_admin";
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [r, v, d] = await Promise.all([api.listRequisitions(), api.listVehicles(true), api.listDrivers(true)]);
    setRequisitions(r.requisitions);
    setVehicles(v.vehicles);
    setDrivers(d.drivers);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Admins/IT admins see every transaction; staff see only their own —
  // matching the same ownership rule used for My Requests / cancelling.
  const scoped = useMemo(() => {
    if (!session) return [];
    if (isAdminLike) return requisitions;
    return requisitions.filter(
      (r) => (r.submitted_by || r.requester).trim().toLowerCase() === session.name.trim().toLowerCase()
    );
  }, [requisitions, session, isAdminLike]);

  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const driverById = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);

  // Every resolved outcome — allocated (Scheduled/Active/Completed), denied,
  // or cancelled — most recent first. Still-pending requests aren't a
  // "transaction" yet, so they're left off this list (they're on My
  // Requests / the Dashboard instead).
  const history = useMemo(
    () =>
      scoped
        .filter((r) => r.status !== "Pending Allocation")
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [scoped]
  );

  function exportCsv() {
    // Column names/order follow the original Allocation Log spreadsheet
    // (Visitor / Employee, Host / Department, Pickup/Drop Location, Total
    // Days) so a report opened from here matches what admins already know,
    // with denial/cancellation columns appended since the spreadsheet
    // never had those.
    const header = [
      "S.no",
      "Visitor / Employee",
      "Host / Department",
      "Start Date",
      "End Date",
      "Total Days",
      "Pickup Location",
      "Drop Location",
      "Purpose",
      "Vehicle Reg No",
      "Vehicle Model",
      "Driver Name",
      "Driver Phone",
      "Status",
      "Allocated At",
      "Denied At",
      "Denial Reason",
      "Cancelled At",
    ];
    const rows = history.map((r) => {
      const v = r.vehicle_id ? vehicleById.get(r.vehicle_id) : undefined;
      const d = r.driver_id ? driverById.get(r.driver_id) : undefined;
      return [
        String(r.sno),
        r.requester,
        r.department,
        r.start_date,
        r.end_date,
        String(totalDays(r.start_date, r.end_date)),
        r.origin,
        r.destination,
        r.purpose ?? "",
        v?.reg_no ?? "",
        v?.model ?? "",
        d?.name ?? "",
        d?.phone ?? "",
        r.status,
        r.allocated_at ?? "",
        r.denied_at ?? "",
        r.denial_reason ?? "",
        r.cancelled_at ?? "",
      ];
    });
    const scope = isAdminLike ? "all" : "mine";
    downloadCsv(`pool-car-allocation-log-${scope}-${new Date().toISOString().slice(0, 10)}.csv`, [
      header,
      ...rows,
    ]);
  }

  return (
    <AppShell>
      <div className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-head font-semibold text-xl text-ink">Transaction History</h1>
          <p className="text-sm text-muted mt-1">
            {isAdminLike
              ? "Every approved, denied, or cancelled requisition across the whole system."
              : "Every approved, denied, or cancelled requisition you've submitted."}
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={history.length === 0}
          className="shrink-0 flex items-center gap-2 rounded-lg border border-border text-ink text-sm px-3.5 py-2 hover:bg-surface2 disabled:opacity-40 transition-colors"
        >
          <Download size={15} />
          Export CSV
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : history.length === 0 ? (
        <p className="text-sm text-muted">Nothing's been approved, denied, or cancelled yet.</p>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted text-xs uppercase tracking-wide border-b border-border">
                <th className="px-4 py-3 font-medium">S.no</th>
                <th className="px-4 py-3 font-medium">Requester</th>
                <th className="px-4 py-3 font-medium">Dates</th>
                <th className="px-4 py-3 font-medium">Route</th>
                <th className="px-4 py-3 font-medium">Vehicle</th>
                <th className="px-4 py-3 font-medium">Driver</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Resolved</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => {
                const v = r.vehicle_id ? vehicleById.get(r.vehicle_id) : undefined;
                const d = r.driver_id ? driverById.get(r.driver_id) : undefined;
                const resolvedAt = r.denied_at || r.cancelled_at || r.allocated_at;
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-3 font-mono text-ink">{r.sno}</td>
                    <td className="px-4 py-3 text-ink">{r.requester}</td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">
                      {r.start_date} → {r.end_date}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {r.origin} → {r.destination}
                    </td>
                    <td className="px-4 py-3 font-mono text-ink">{v?.reg_no ?? "—"}</td>
                    <td className="px-4 py-3 text-ink">{d?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                      {r.denial_reason && <div className="text-xs text-red mt-1">Reason: {r.denial_reason}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted whitespace-nowrap">
                      {resolvedAt ? new Date(resolvedAt).toLocaleString() : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
