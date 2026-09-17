"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import AppShell from "@/components/AppShell";
import StatusBadge from "@/components/StatusBadge";
import { api } from "@/lib/api";
import type { DirectoryUser, Requisition, Vehicle, Driver, ActivityLogEntry } from "@/lib/types";
import { Plus, Trash2, ShieldCheck, User as UserIcon } from "lucide-react";

export default function ItAdminPage() {
  const [admins, setAdmins] = useState<DirectoryUser[]>([]);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [activity, setActivity] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminPin, setNewAdminPin] = useState("");
  const [adminError, setAdminError] = useState("");
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);

  const [selectedName, setSelectedName] = useState("");

  const load = useCallback(async () => {
    const [a, dir, v, d, r, log] = await Promise.all([
      api.listAdmins(),
      api.listDirectory(),
      api.listVehicles(true),
      api.listDrivers(true),
      api.listRequisitions(),
      api.listActivityLog(),
    ]);
    setAdmins(a.admins);
    setDirectory(dir.people);
    setVehicles(v.vehicles);
    setDrivers(d.drivers);
    setRequisitions(r.requisitions);
    setActivity(log.entries);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addAdmin(e: React.FormEvent) {
    e.preventDefault();
    setAdminError("");
    if (!newAdminName.trim() || !newAdminPin.trim()) return setAdminError("Name and PIN are required.");
    try {
      await api.addAdmin(newAdminName.trim(), newAdminPin.trim());
      setNewAdminName("");
      setNewAdminPin("");
      load();
    } catch (err: any) {
      setAdminError(err.message);
    }
  }

  async function removeAdmin(id: number) {
    setRowError(null);
    try {
      await api.removeAdmin(id);
      load();
    } catch (err: any) {
      setRowError({ id, message: err.message });
    }
  }

  // Per-person drill-down: everything this person submitted, and every
  // activity_log entry recorded under their name (as actor_name).
  const selected = useMemo(() => {
    if (!selectedName) return null;
    const person = directory.find((p) => p.name === selectedName);
    const theirRequisitions = requisitions.filter(
      (r) => (r.submitted_by || r.requester).trim().toLowerCase() === selectedName.trim().toLowerCase()
    );
    const theirActivity = activity.filter(
      (e) => (e.actor_name ?? "").trim().toLowerCase() === selectedName.trim().toLowerCase()
    );
    return { person, theirRequisitions, theirActivity };
  }, [selectedName, directory, requisitions, activity]);

  return (
    <AppShell>
      <div className="mb-7">
        <h1 className="font-head font-semibold text-xl text-ink">Admins &amp; Directory</h1>
        <p className="text-sm text-muted mt-1">
          IT admin tools: manage other admin accounts, and look up anyone who's used the system.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="space-y-8">
          {/* Admin accounts */}
          <section>
            <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Admin accounts</h2>
            <form onSubmit={addAdmin} className="rounded-xl border border-border bg-surface p-4 flex gap-2 mb-3">
              <input
                value={newAdminName}
                onChange={(e) => setNewAdminName(e.target.value)}
                placeholder="Name"
                className="flex-1 rounded-lg bg-surface2 border border-border px-3 py-2 text-sm text-ink outline-none focus:border-amber/60"
              />
              <input
                value={newAdminPin}
                onChange={(e) => setNewAdminPin(e.target.value)}
                placeholder="PIN"
                className="w-32 rounded-lg bg-surface2 border border-border px-3 py-2 text-sm text-ink font-mono outline-none focus:border-amber/60"
              />
              <button className="rounded-lg bg-amber text-bg px-3 py-2 hover:opacity-90 transition-opacity" aria-label="Add admin">
                <Plus size={16} />
              </button>
            </form>
            {adminError && <p className="text-xs text-red mb-3">{adminError}</p>}

            <div className="grid sm:grid-cols-2 gap-2">
              {admins.map((a) => (
                <div
                  key={a.id}
                  className={`rounded-xl border border-border bg-surface px-4 py-3 flex items-center justify-between ${
                    !a.active ? "opacity-50" : ""
                  }`}
                >
                  <div>
                    <div className="text-sm text-ink flex items-center gap-2">
                      {a.role === "it_admin" ? (
                        <ShieldCheck size={13} className="text-amber" />
                      ) : (
                        <UserIcon size={13} className="text-muted" />
                      )}
                      {a.name}
                      {!a.active && <span className="text-[10px] uppercase tracking-wide text-red">Removed</span>}
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {a.role === "it_admin" ? "IT Admin" : "Admin"} · last login{" "}
                      {a.last_login ? new Date(a.last_login).toLocaleString() : "never"}
                    </div>
                    {rowError?.id === a.id && <p className="text-xs text-red mt-1">{rowError.message}</p>}
                  </div>
                  {a.role === "admin" && a.active && (
                    <button
                      onClick={() => removeAdmin(a.id)}
                      className="text-muted hover:text-red transition-colors p-1.5"
                      aria-label={`Remove ${a.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Person lookup */}
          <section>
            <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Look up a person</h2>
            <select
              value={selectedName}
              onChange={(e) => setSelectedName(e.target.value)}
              className="w-full max-w-sm rounded-lg bg-surface2 border border-border px-3.5 py-2.5 text-sm text-ink outline-none focus:border-amber/60 mb-4"
            >
              <option value="">Select a person…</option>
              {directory.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name} ({p.role === "it_admin" ? "IT Admin" : p.role})
                </option>
              ))}
            </select>

            {selected && (
              <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
                <div className="text-sm text-ink">
                  <span className="font-medium">{selectedName}</span>{" "}
                  <span className="text-muted">
                    · {selected.person?.role} · last login{" "}
                    {selected.person?.last_login ? new Date(selected.person.last_login).toLocaleString() : "never"}
                  </span>
                </div>

                <div>
                  <div className="text-xs text-muted uppercase tracking-wide mb-2">
                    Requisitions ({selected.theirRequisitions.length})
                  </div>
                  {selected.theirRequisitions.length === 0 ? (
                    <p className="text-sm text-muted">None.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {selected.theirRequisitions.map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-sm">
                          <span className="text-ink">
                            <span className="font-mono text-muted mr-2">#{r.sno}</span>
                            {r.origin} → {r.destination}
                          </span>
                          <StatusBadge status={r.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-xs text-muted uppercase tracking-wide mb-2">
                    Actions logged ({selected.theirActivity.length})
                  </div>
                  {selected.theirActivity.length === 0 ? (
                    <p className="text-sm text-muted">None.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {selected.theirActivity.slice(0, 20).map((e) => (
                        <div key={e.id} className="flex items-center justify-between text-sm">
                          <span className="text-ink">{e.action}</span>
                          <span className="text-muted text-xs">{new Date(e.created_at).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Fleet snapshot */}
          <section>
            <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Current fleet</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted mb-2">Vehicles ({vehicles.filter((v) => v.active).length} active)</div>
                <div className="space-y-1.5">
                  {vehicles.map((v) => (
                    <div key={v.id} className={`text-sm flex justify-between ${!v.active ? "opacity-40" : ""}`}>
                      <span className="font-mono text-ink">{v.reg_no}</span>
                      <span className="text-muted">{v.model}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted mb-2">Drivers ({drivers.filter((d) => d.active).length} active)</div>
                <div className="space-y-1.5">
                  {drivers.map((d) => (
                    <div key={d.id} className={`text-sm flex justify-between ${!d.active ? "opacity-40" : ""}`}>
                      <span className="text-ink">{d.name}</span>
                      <span className="text-muted font-mono">{d.phone ?? "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted mt-3">
              To add, remove, or restore fleet entries, use the Manage Fleet page.
            </p>
          </section>
        </div>
      )}
    </AppShell>
  );
}
