import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface KPICardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  color: "primary" | "secondary" | "tertiary" | "success" | "danger" | "warning" | "accent";
}

const colorMap = {
  primary: {
    icon: "bg-gradient-to-br from-primary to-primary-dark text-white shadow-md shadow-primary/25",
    ring: "ring-primary/20",
    accent: "from-primary/80",
  },
  secondary: {
    icon: "bg-gradient-to-br from-secondary to-secondary-dark text-white shadow-md shadow-secondary/25",
    ring: "ring-secondary/20",
    accent: "from-secondary/80",
  },
  tertiary: {
    icon: "bg-gradient-to-br from-tertiary to-tertiary-dark text-white shadow-md shadow-tertiary/25",
    ring: "ring-tertiary/20",
    accent: "from-tertiary/80",
  },
  success: {
    icon: "bg-gradient-to-br from-success to-success-dark text-white shadow-md shadow-success/25",
    ring: "ring-success/20",
    accent: "from-success/80",
  },
  danger: {
    icon: "bg-gradient-to-br from-danger to-danger-dark text-white shadow-md shadow-danger/25",
    ring: "ring-danger/20",
    accent: "from-danger/80",
  },
  warning: {
    icon: "bg-gradient-to-br from-warning to-warning-dark text-white shadow-md shadow-warning/25",
    ring: "ring-warning/20",
    accent: "from-warning/80",
  },
  accent: {
    icon: "bg-gradient-to-br from-accent to-accent-dark text-white shadow-md shadow-accent/25",
    ring: "ring-accent/20",
    accent: "from-accent/80",
  },
};

export function KPICard({ icon: Icon, label, value, trend, trendUp, color }: KPICardProps) {
  const palette = colorMap[color];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-card p-5 shadow-card-md ring-1 animate-fade-in-up",
        palette.ring
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r to-transparent", palette.accent)} />
      <div className="flex items-start justify-between">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl", palette.icon)}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <span
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              trendUp ? "bg-success-light text-success-dark" : "bg-danger-light text-danger-dark"
            )}
          >
            {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend}
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-text-primary">{value}</p>
      <p className="text-sm font-medium text-text-secondary">{label}</p>
    </div>
  );
}
