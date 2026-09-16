"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session-context";
import type { Message } from "@/lib/types";
import { Send, ShieldCheck, User as UserIcon } from "lucide-react";

const POLL_MS = 4000;

export default function MessagesPage() {
  const session = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { messages } = await api.listMessages();
    setMessages(messages);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setError("");
    setSending(true);
    try {
      await api.sendMessage(body);
      setText("");
      load();
    } catch (err: any) {
      setError(err.message || "Could not send that message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-7">
        <h1 className="font-head font-semibold text-xl text-ink">Messages</h1>
        <p className="text-sm text-muted mt-1">
          A shared channel between staff and admins — everyone signed in can see and post here.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface flex flex-col h-[60vh] max-h-[640px]">
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted">No messages yet — say hello.</p>
          ) : (
            messages.map((m) => {
              const mine = session?.name.trim().toLowerCase() === m.sender_name.trim().toLowerCase();
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-xl px-3.5 py-2.5 ${mine ? "bg-teal/15" : "bg-surface2"}`}>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted mb-1">
                      {m.sender_role === "admin" ? (
                        <ShieldCheck size={11} className="text-amber" />
                      ) : (
                        <UserIcon size={11} className="text-teal" />
                      )}
                      <span className="font-medium text-ink">{m.sender_name}</span>
                      <span>· {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                    <div className="text-sm text-ink whitespace-pre-wrap break-words">{m.body}</div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSend} className="border-t border-border p-3 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message…"
            maxLength={2000}
            className="flex-1 rounded-lg bg-surface2 border border-border px-3.5 py-2.5 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-teal/60"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="rounded-lg bg-teal text-bg px-4 py-2.5 hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5 text-sm font-medium"
          >
            <Send size={15} />
            Send
          </button>
        </form>
      </div>
      {error && <p className="text-xs text-red mt-2">{error}</p>}
    </AppShell>
  );
}
