import { cn } from "@/lib/utils";
import type { OrderStatus, PaymentType } from "@/data/mockData";

const statusConfig: Record<OrderStatus, { bg: string; text: string; label: string }> = {
  delivered: { bg: "bg-success-light", text: "text-success-dark", label: "Delivered" },
  "in-transit": { bg: "bg-secondary-light", text: "text-secondary-dark", label: "In Transit" },
  "out-for-delivery": { bg: "bg-blue-50", text: "text-blue-700", label: "Out for Delivery" },
  ndr: { bg: "bg-warning-light", text: "text-warning-dark", label: "NDR" },
  rto: { bg: "bg-danger-light", text: "text-danger-dark", label: "RTO" },
  pending: { bg: "bg-primary-light", text: "text-primary-dark", label: "Pending" },
  "ready-to-ship": { bg: "bg-green-50", text: "text-green-700", label: "Ready to Ship" },
  "not-picked": { bg: "bg-accent-light", text: "text-accent-dark", label: "Not Picked" },
  cancelled: { bg: "bg-surface-2", text: "text-text-secondary", label: "Cancelled" },
  draft: { bg: "bg-surface-2", text: "text-text-muted", label: "Draft" },
  "on-process": { bg: "bg-tertiary-light", text: "text-tertiary-dark", label: "On Process" },
};

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const config = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", config.bg, config.text, className)}>
      {config.label}
    </span>
  );
}

export function PaymentBadge({ type }: { type: PaymentType }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
      type === "COD" ? "bg-accent-light text-accent-dark" : "bg-primary-light text-primary-dark"
    )}>
      {type}
    </span>
  );
}
