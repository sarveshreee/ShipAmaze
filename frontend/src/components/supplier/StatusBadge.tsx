import { cn } from "@/lib/utils";

const map: Record<string, string> = {
  active: "bg-success-light text-success-dark",
  draft: "bg-surface-2 text-text-secondary",
  inactive: "bg-danger-light text-danger-dark",
  pending: "bg-warning-light text-warning-dark",
  approved: "bg-success-light text-success-dark",
  rejected: "bg-danger-light text-danger-dark",
  needs_changes: "bg-warning-light text-warning-dark",
};

export function ProductStatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide",
      map[status] || "bg-surface-2 text-text-secondary"
    )}>
      {status.replace("_", " ")}
    </span>
  );
}
