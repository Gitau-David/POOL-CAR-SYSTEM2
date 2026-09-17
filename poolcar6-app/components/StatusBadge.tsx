import type { RequisitionStatus } from "@/lib/types";

const STYLES: Record<RequisitionStatus, { bar: string; text: string; dot: string }> = {
  "Pending Allocation": { bar: "border-amber", text: "text-amber", dot: "bg-amber" },
  Scheduled: { bar: "border-blue", text: "text-blue", dot: "bg-blue" },
  Active: { bar: "border-teal", text: "text-teal", dot: "bg-teal" },
  Completed: { bar: "border-muted", text: "text-muted", dot: "bg-muted" },
  Denied: { bar: "border-red", text: "text-red", dot: "bg-red" },
  Cancelled: { bar: "border-muted", text: "text-muted", dot: "bg-muted" },
};

export default function StatusBadge({ status }: { status: RequisitionStatus }) {
  const s = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}
