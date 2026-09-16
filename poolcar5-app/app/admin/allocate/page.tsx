"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import StatusBadge from "@/components/StatusBadge";
import { api } from "@/lib/api";
import type { Requisition, Vehicle, Driver } from "@/lib/types";
import { CheckCircle2, ChevronRight, XCircle } from "lucide-react";

export default function AllocatePage() {
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [denied, setDenied] = useState<Requisition[]>([]);
  const [selected, setSelected] = useState<Requisition | null>(null);
  const [options, setOptions] = useState<{ vehicles: Vehicle[]; drivers: Driver[] } | null>(null);
  const [vehicleId, setVehicleId] = useState<number | "">("");
  const [driverId, setDriverId] = useState<number | "">("");
  const [denyReason, setDenyReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justResolved, setJustResolved] = useState<{ kind: "approved" | "denied"; requisition: Requisition } | null>(
    null
  );

  const load = useCallback(async () => {
    const { requisitions: all } = await api.listRequisitions();
    setRequisitions(all.filter((r) => r.status === "Pending Allocation"));
    setDenied(all.filter((r) => r.status === "Denied").slice(-5).reverse());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function selectRequisition(r: Requisition) {
    setSelected(r);
    setVehicleId("");
    setDriverId("");
    setDenyReason("");
    setError("");
    setJustResolved(null);
    // The system computes availability server-side — the admin never manually checks.
    const result = await api.availability(r.start_date, r.end_date);
    setOptions(result);
  }

  async function handleApprove() {
    if (!selected || !vehicleId || !driverId) return;
    setError("");
    setSubmitting(true);
    try {
      const { requisition } = await api.allocate(selected.id, Number(vehicleId), Number(driverId));
      setJustResolved({ kind: "approved", requisition });
      setSelected(null);
      setOptions(null);
      load();
    } catch (err: any) {
      setError(err.message || "Could not allocate.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeny() {
    if (!selected) return;
    setError("");
    setSubmitting(true);
    try {
      const { requisition } = await api.deny(selected.id, denyReason.trim() || undefined);
      setJustResolved({ kind: "denied", requisition });
      setSelected(null);
      setOptions(null);
      load();
    } catch (err: any) {
      setError(err.message || "Could not deny.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-7">
        <h1 className="font-head font-semibold text-xl text-ink">Allocate Vehicle</h1>
        <p className="text-sm text-muted mt-1">
          Pick a pending request — the system checks the database for real conflicts and only shows you
          vehicles and drivers that are actually free for those dates. Approve it, or deny it with a reason.
        </p>
      </div>

      {justResolved && (
        <div
          className={`mb-6 rounded-xl border px-4 py-3.5 flex items-start gap-3 ${
            justResolved.kind === "approved" ? "border-teal/40 bg-teal/10" : "border-red/40 bg-red/10"
          }`}
        >
          {justResolved.kind === "approved" ? (
            <CheckCircle2 size={18} className="text-teal mt-0.5 shrink-0" />
          ) : (
            <XCircle size={18} className="text-red mt-0.5 shrink-0" />
          )}
          <div className="text-sm text-ink">
            {justResolved.kind === "approved" ? (
              <>
                Allocated for <span className="font-mono text-teal">S.no {justResolved.requisition.sno}</span>. It
                now shows as Scheduled on the dashboard.
              </>
            ) : (
              <>
                Denied <span className="font-mono text-red">S.no {justResolved.requisition.sno}</span>.
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Pending Allocation</h2>
          <div className="space-y-2">
            {requisitions.map((r) => (
              <button
                key={r.id}
                onClick={() => selectRequisition(r)}
                className={`w-full text-left rounded-xl border bg-surface px-4 py-3.5 flex items-center justify-between transition-colors ${
                  selected?.id === r.id ? "border-amber/60 bg-surface2" : "border-border hover:bg-surface2/60"
                }`}
              >
                <div>
                  <div className="text-sm text-ink">
                    <span className="font-mono text-amber mr-2">#{r.sno}</span>
                    {r.requester} · {r.department}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {r.start_date} → {r.end_date} · {r.origin} → {r.destination}
                  </div>
                </div>
                <ChevronRight size={16} className="text-muted shrink-0" />
              </button>
            ))}
            {requisitions.length === 0 && (
              <p className="text-sm text-muted">No pending requisitions — all caught up.</p>
            )}
          </div>

          {denied.length > 0 && (
            <div className="mt-6">
              <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Recently denied</h2>
              <div className="space-y-2">
                {denied.map((r) => (
                  <div key={r.id} className="rounded-xl border border-border bg-surface px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-ink">
                        <span className="font-mono text-red mr-2">#{r.sno}</span>
                        {r.requester} · {r.department}
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    {r.denial_reason && <div className="text-xs text-muted mt-1">{r.denial_reason}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section>
          <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">
            {selected ? `Decide on #${selected.sno}` : "Select a request"}
          </h2>

          {!selected && (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
              Choose a pending requisition on the left to see what's actually free for its dates, or to deny it.
            </div>
          )}

          {selected && options && (
            <div className="rounded-2xl border border-border bg-surface p-5 space-y-5">
              <div>
                <label className="text-xs text-muted mb-1.5 block">Vehicle</label>
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded-lg bg-surface2 border border-border px-3.5 py-2.5 text-sm text-ink outline-none focus:border-amber/60"
                >
                  <option value="">Select vehicle…</option>
                  {options.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.reg_no} — {v.model}
                    </option>
                  ))}
                </select>
                {options.vehicles.length === 0 && (
                  <p className="text-xs text-red mt-1.5">No vehicles free for these dates.</p>
                )}
              </div>

              <div>
                <label className="text-xs text-muted mb-1.5 block">Driver</label>
                <select
                  value={driverId}
                  onChange={(e) => setDriverId(e.target.value ? Number(e.target.value) : "")}
                  className="w-full rounded-lg bg-surface2 border border-border px-3.5 py-2.5 text-sm text-ink outline-none focus:border-amber/60"
                >
                  <option value="">Select driver…</option>
                  {options.drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                {options.drivers.length === 0 && (
                  <p className="text-xs text-red mt-1.5">No drivers free for these dates.</p>
                )}
              </div>

              {error && <p className="text-xs text-red">{error}</p>}

              <button
                onClick={handleApprove}
                disabled={!vehicleId || !driverId || submitting}
                className="w-full rounded-lg bg-amber text-bg font-medium text-sm py-2.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {submitting ? "Working…" : "Approve allocation"}
              </button>

              <div className="pt-4 border-t border-border space-y-3">
                <label className="text-xs text-muted block">Deny instead (optional reason)</label>
                <input
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                  placeholder="e.g. No vehicles free that week"
                  className="w-full rounded-lg bg-surface2 border border-border px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-red/60"
                />
                <button
                  onClick={handleDeny}
                  disabled={submitting}
                  className="w-full rounded-lg border border-red/40 text-red font-medium text-sm py-2.5 hover:bg-red/10 disabled:opacity-50 transition-colors"
                >
                  {submitting ? "Working…" : "Deny request"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
