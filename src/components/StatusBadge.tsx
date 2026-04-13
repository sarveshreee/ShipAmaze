import { cn } from "@/lib/utils";
import {
  CheckCircle2, Truck, PackageOpen, AlertTriangle, RotateCcw, Clock, PackageCheck,
  PackageX, XCircle, FileEdit, Loader2, Undo2, LucideIcon, HelpCircle
} from "lucide-react";

const statusConfig: Record<string, { bg: string; text: string; label: string; icon: LucideIcon }> = {
  delivered: { bg: "bg-success-light", text: "text-success-dark", label: "Delivered", icon: CheckCircle2 },
  "in-transit": { bg: "bg-secondary-light", text: "text-secondary-dark", label: "In Transit", icon: Truck },
  "out-for-delivery": { bg: "bg-blue-50", text: "text-blue-700", label: "Out for Delivery", icon: PackageOpen },
  ndr: { bg: "bg-warning-light", text: "text-warning-dark", label: "NDR", icon: AlertTriangle },
  rto: { bg: "bg-danger-light", text: "text-danger-dark", label: "RTO", icon: RotateCcw },
  pending: { bg: "bg-primary-light", text: "text-primary-dark", label: "Pending", icon: Clock },
  "ready-to-ship": { bg: "bg-green-50", text: "text-green-700", label: "Ready to Ship", icon: PackageCheck },
  "not-picked": { bg: "bg-accent-light", text: "text-accent-dark", label: "Not Picked", icon: PackageX },
  cancelled: { bg: "bg-surface-2", text: "text-text-secondary", label: "Cancelled", icon: XCircle },
  draft: { bg: "bg-surface-2", text: "text-text-muted", label: "Draft", icon: FileEdit },
  "on-process": { bg: "bg-tertiary-light", text: "text-tertiary-dark", label: "On Process", icon: Loader2 },
  rts: { bg: "bg-warning-light", text: "text-warning-dark", label: "Return to Seller", icon: Undo2 },
};

const defaultConfig = { bg: "bg-surface-2", text: "text-text-muted", label: "Unknown", icon: HelpCircle };

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const config = statusConfig[status] || defaultConfig;
  const Icon = config.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", config.bg, config.text, className)}>
      <Icon className="h-3 w-3" />
      {config.label || status}
    </span>
  );
}

export function PaymentBadge({ type }: { type: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
      type === "COD" ? "bg-accent-light text-accent-dark" : "bg-primary-light text-primary-dark"
    )}>
      {type}
    </span>
  );
}
