"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session-context";
import type { Requisition } from "@/lib/types";
import { CheckCircle2 } from "lucide-react";

const initial = {
  department: "",
  start_date: "",
  end_date: "",
  origin: "",
  destination: "",
  purpose: "",
};

export default function RequestPage() {
  const session = useSession();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<Requisition | null>(null);

  function update<K extends keyof typeof initial>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.start_date && form.end_date && form.start_date > form.end_date) {
      return setError("End date must be on or after the start date.");
    }
    setSubmitting(true);
    try {
      const { requisition } = await api.createRequisition(form);
      setConfirmed(requisition);
      setForm(initial);
    } catch (err: any) {
      setError(err.message || "Could not submit the request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-7">
        <h1 className="font-head font-semibold text-xl text-ink">New Requisition</h1>
        <p className="text-sm text-muted mt-1">
          Submit a request — it lands as <span className="text-amber">Pending Allocation</span> until an admin
          approves or denies it. Track it any time on{" "}
          <span className="text-ink font-medium">My Requests</span>.
        </p>
      </div>

      {confirmed && (
        <div className="mb-6 rounded-xl border border-teal/40 bg-teal/10 px-4 py-3.5 flex items-start gap-3">
          <CheckCircle2 size={18} className="text-teal mt-0.5 shrink-0" />
          <div className="text-sm text-ink">
            Request submitted — assigned{" "}
            <span className="font-mono text-teal">S.no {confirmed.sno}</span>. It now appears on the dashboard as
            Pending Allocation.
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-xl rounded-2xl border border-border bg-surface p-6 space-y-4">
        <Field label="Requester">
          <div className="input flex items-center text-muted">{session?.name}</div>
        </Field>
        <Field label="Department">
          <input
            required
            value={form.department}
            onChange={(e) => update("department", e.target.value)}
            className="input"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start date">
            <input
              required
              type="date"
              value={form.start_date}
              onChange={(e) => update("start_date", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="End date">
            <input
              required
              type="date"
              value={form.end_date}
              onChange={(e) => update("end_date", e.target.value)}
              className="input"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Origin">
            <input
              required
              value={form.origin}
              onChange={(e) => update("origin", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Destination">
            <input
              required
              value={form.destination}
              onChange={(e) => update("destination", e.target.value)}
              className="input"
            />
          </Field>
        </div>
        <Field label="Purpose (optional)">
          <textarea
            value={form.purpose}
            onChange={(e) => update("purpose", e.target.value)}
            rows={3}
            className="input resize-none"
          />
        </Field>

        {error && <p className="text-xs text-red">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-teal text-bg font-medium text-sm px-5 py-2.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {submitting ? "Submitting…" : "Submit request"}
        </button>
      </form>

      <style jsx global>{`
        .input {
          width: 100%;
          border-radius: 0.5rem;
          background: #1b2740;
          border: 1px solid #24314d;
          padding: 0.6rem 0.9rem;
          font-size: 0.875rem;
          color: #e5eaf3;
          outline: none;
        }
        .input:focus {
          border-color: rgba(45, 212, 191, 0.6);
        }
      `}</style>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
