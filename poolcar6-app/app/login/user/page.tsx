"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, User } from "lucide-react";
import { api } from "@/lib/api";

export default function UserLoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Enter your name to continue.");
    setLoading(true);
    try {
      await api.login("user", name.trim());
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <button
        onClick={() => router.push("/")}
        className="absolute top-6 left-6 flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-teal/15 flex items-center justify-center mb-3">
            <User size={22} className="text-teal" />
          </div>
          <h1 className="font-head font-semibold text-lg text-ink">Staff Login</h1>
          <p className="text-xs text-muted mt-1">Just your name — no password needed</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-surface p-6 space-y-4">
          <div>
            <label className="text-xs text-muted mb-1.5 block">Full name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Diana Achieng"
              className="w-full rounded-lg bg-surface2 border border-border px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-teal/60"
            />
          </div>

          {error && <p className="text-xs text-red">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-teal text-bg font-medium text-sm py-2.5 hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Signing in…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
