import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface KPICardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  color: "primary" | "secondary" | "tertiary" | "success" | "danger" | "warning";
}

const colorMap = {
  primary: "bg-primary-light text-primary",
  secondary: "bg-secondary-light text-secondary",
  tertiary: "bg-tertiary-light text-tertiary",
  success: "bg-success-light text-success",
  danger: "bg-danger-light text-danger",
  warning: "bg-warning-light text-warning",
};

export function KPICard({ icon: Icon, label, value, trend, trendUp, color }: KPICardProps) {
  return (
    <div className="rounded-lg bg-card p-5 shadow-card animate-fade-in-up">
      <div className="flex items-start justify-between">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-md", colorMap[color])}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <span className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            trendUp ? "bg-success-light text-success-dark" : "bg-danger-light text-danger-dark"
          )}>
            {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend}
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold text-text-primary">{value}</p>
      <p className="text-sm text-text-secondary">{label}</p>
    </div>
  );
}
