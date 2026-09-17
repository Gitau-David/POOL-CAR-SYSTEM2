"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import type { Vehicle, Driver } from "@/lib/types";
import { Trash2, Plus, RotateCcw } from "lucide-react";

export default function FleetPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [regNo, setRegNo] = useState("");
  const [model, setModel] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [vehicleError, setVehicleError] = useState("");
  const [driverError, setDriverError] = useState("");
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);

  // Fetch with all=true so removed (inactive) vehicles/drivers are still
  // visible here — dimmed, with a Restore button — instead of just
  // vanishing with no confirmation that the removal actually took effect.
  const load = useCallback(async () => {
    const [v, d] = await Promise.all([api.listVehicles(true), api.listDrivers(true)]);
    setVehicles(v.vehicles);
    setDrivers(d.drivers);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addVehicle(e: React.FormEvent) {
    e.preventDefault();
    setVehicleError("");
    if (!regNo.trim() || !model.trim()) return setVehicleError("Reg. no and model are required.");
    try {
      await api.addVehicle(regNo.trim(), model.trim());
      setRegNo("");
      setModel("");
      load();
    } catch (err: any) {
      setVehicleError(err.message);
    }
  }

  async function removeVehicle(id: number) {
    setRowError(null);
    try {
      await api.removeVehicle(id);
      load();
    } catch (err: any) {
      setRowError({ id, message: err.message });
    }
  }

  async function restoreVehicle(v: Vehicle) {
    setRowError(null);
    try {
      await api.addVehicle(v.reg_no, v.model);
      load();
    } catch (err: any) {
      setRowError({ id: v.id, message: err.message });
    }
  }

  async function addDriver(e: React.FormEvent) {
    e.preventDefault();
    setDriverError("");
    if (!driverName.trim()) return setDriverError("Driver name is required.");
    try {
      await api.addDriver(driverName.trim(), driverPhone.trim() || undefined);
      setDriverName("");
      setDriverPhone("");
      load();
    } catch (err: any) {
      setDriverError(err.message);
    }
  }

  async function removeDriver(id: number) {
    setRowError(null);
    try {
      await api.removeDriver(id);
      load();
    } catch (err: any) {
      setRowError({ id, message: err.message });
    }
  }

  async function restoreDriver(id: number) {
    setRowError(null);
    try {
      await api.restoreDriver(id);
      load();
    } catch (err: any) {
      setRowError({ id, message: err.message });
    }
  }

  return (
    <AppShell>
      <div className="mb-7">
        <h1 className="font-head font-semibold text-xl text-ink">Manage Fleet</h1>
        <p className="text-sm text-muted mt-1">
          Add or remove vehicles and drivers. A vehicle or driver with a Scheduled or Active trip can't be
          removed until that trip is done — removal never deletes history, it just retires the entry
          (shown dimmed below, with a Restore option).
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Vehicles</h2>

          <form onSubmit={addVehicle} className="rounded-xl border border-border bg-surface p-4 flex gap-2 mb-3">
            <input
              value={regNo}
              onChange={(e) => setRegNo(e.target.value)}
              placeholder="Reg. no"
              className="flex-1 rounded-lg bg-surface2 border border-border px-3 py-2 text-sm text-ink font-mono outline-none focus:border-teal/60"
            />
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Model"
              className="flex-1 rounded-lg bg-surface2 border border-border px-3 py-2 text-sm text-ink outline-none focus:border-teal/60"
            />
            <button className="rounded-lg bg-teal text-bg px-3 py-2 hover:opacity-90 transition-opacity" aria-label="Add vehicle">
              <Plus size={16} />
            </button>
          </form>
          {vehicleError && <p className="text-xs text-red mb-3">{vehicleError}</p>}

          <div className="space-y-2">
            {vehicles.map((v) => (
              <div
                key={v.id}
                className={`rounded-xl border border-border bg-surface px-4 py-3 flex items-center justify-between ${
                  !v.active ? "opacity-50" : ""
                }`}
              >
                <div>
                  <div className="text-sm text-ink font-mono flex items-center gap-2">
                    {v.reg_no}
                    {!v.active && (
                      <span className="text-[10px] uppercase tracking-wide text-red font-sans">Removed</span>
                    )}
                  </div>
                  <div className="text-xs text-muted">{v.model}</div>
                  {rowError?.id === v.id && <p className="text-xs text-red mt-1">{rowError.message}</p>}
                </div>
                {v.active ? (
                  <button
                    onClick={() => removeVehicle(v.id)}
                    className="text-muted hover:text-red transition-colors p-1.5"
                    aria-label={`Remove ${v.reg_no}`}
                  >
                    <Trash2 size={15} />
                  </button>
                ) : (
                  <button
                    onClick={() => restoreVehicle(v)}
                    className="flex items-center gap-1.5 text-xs text-teal hover:opacity-80 transition-opacity px-2 py-1"
                  >
                    <RotateCcw size={13} />
                    Restore
                  </button>
                )}
              </div>
            ))}
            {vehicles.length === 0 && <p className="text-sm text-muted">No vehicles yet.</p>}
          </div>
        </section>

        <section>
          <h2 className="text-xs font-medium text-muted uppercase tracking-wide mb-3">Drivers</h2>

          <form onSubmit={addDriver} className="rounded-xl border border-border bg-surface p-4 flex gap-2 mb-3">
            <input
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              placeholder="Name"
              className="flex-1 rounded-lg bg-surface2 border border-border px-3 py-2 text-sm text-ink outline-none focus:border-teal/60"
            />
            <input
              value={driverPhone}
              onChange={(e) => setDriverPhone(e.target.value)}
              placeholder="Phone (optional)"
              className="flex-1 rounded-lg bg-surface2 border border-border px-3 py-2 text-sm text-ink font-mono outline-none focus:border-teal/60"
            />
            <button className="rounded-lg bg-teal text-bg px-3 py-2 hover:opacity-90 transition-opacity" aria-label="Add driver">
              <Plus size={16} />
            </button>
          </form>
          {driverError && <p className="text-xs text-red mb-3">{driverError}</p>}

          <div className="space-y-2">
            {drivers.map((d) => (
              <div
                key={d.id}
                className={`rounded-xl border border-border bg-surface px-4 py-3 flex items-center justify-between ${
                  !d.active ? "opacity-50" : ""
                }`}
              >
                <div>
                  <div className="text-sm text-ink flex items-center gap-2">
                    {d.name}
                    {!d.active && <span className="text-[10px] uppercase tracking-wide text-red">Removed</span>}
                  </div>
                  {d.phone && <div className="text-xs text-muted font-mono">{d.phone}</div>}
                  {rowError?.id === d.id && <p className="text-xs text-red mt-1">{rowError.message}</p>}
                </div>
                {d.active ? (
                  <button
                    onClick={() => removeDriver(d.id)}
                    className="text-muted hover:text-red transition-colors p-1.5"
                    aria-label={`Remove ${d.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                ) : (
                  <button
                    onClick={() => restoreDriver(d.id)}
                    className="flex items-center gap-1.5 text-xs text-teal hover:opacity-80 transition-opacity px-2 py-1"
                  >
                    <RotateCcw size={13} />
                    Restore
                  </button>
                )}
              </div>
            ))}
            {drivers.length === 0 && <p className="text-sm text-muted">No drivers yet.</p>}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
