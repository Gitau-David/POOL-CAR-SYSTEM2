"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import StatusBadge from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session-context";
import type { Requisition } from "@/lib/types";
import { XCircle } from "lucide-react";

const POLL_MS = 8000;

export default function MyRequestsPage() {
  const session = useSession();
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { requisitions: all } = await api.listRequisitions();
    const mine = session
      ? all.filter((r) => r.requester.trim().toLowerCase() === session.name.trim().toLowerCase())
      : [];
    setRequisitions(mine.slice().reverse());
    setLoading(false);
  }, [session]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  async function handleCancel(id: number) {
    setError("");
    setBusyId(id);
    try {
      await api.cancelRequisition(id);
      load();
    } catch (err: any) {
      setError(err.message || "Could not cancel this request.");
    } finally {
      setBusyId(null);
    }
  }

  const canCancel = (r: Requisition) => r.status === "Pending Allocation" || r.status === "Scheduled";

  return (
    <AppShell>
      <div className="mb-7">
        <h1 className="font-head font-semibold text-xl text-ink">My Requests</h1>
        <p className="text-sm text-muted mt-1">
          Every request you've submitted, whether it's still pending, been approved, denied, or cancelled.
        </p>
      </div>

      {error && <p className="text-xs text-red mb-4">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : requisitions.length === 0 ? (
        <p className="text-sm text-muted">You haven't submitted any requests yet.</p>
      ) : (
        <div className="space-y-3">
          {requisitions.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-surface px-4 py-3.5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-ink">
                    <span className="font-mono text-muted mr-2">#{r.sno}</span>
                    {r.origin} → {r.destination}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    {r.start_date} → {r.end_date} · {r.department}
                  </div>
                  {r.denial_reason && (
                    <div className="text-xs text-red mt-1.5">Denied: {r.denial_reason}</div>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={r.status} />
                  {canCancel(r) && (
                    <button
                      onClick={() => handleCancel(r.id)}
                      disabled={busyId === r.id}
                      className="flex items-center gap-1 text-xs text-muted hover:text-red transition-colors disabled:opacity-50"
                    >
                      <XCircle size={14} />
                      {busyId === r.id ? "Cancelling…" : "Cancel"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
