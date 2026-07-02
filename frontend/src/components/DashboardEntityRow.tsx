import { cn } from "@/lib/utils";

const RANK_STYLES = [
  "bg-gradient-to-br from-amber-400 to-orange-500",
  "bg-gradient-to-br from-slate-400 to-slate-500",
  "bg-gradient-to-br from-amber-600 to-amber-700",
  "bg-gradient-to-br from-primary to-primary-dark",
  "bg-gradient-to-br from-secondary to-secondary-dark",
];

const AVATAR_PALETTES = [
  "bg-gradient-to-br from-primary to-orange-600",
  "bg-gradient-to-br from-secondary to-teal-700",
  "bg-gradient-to-br from-tertiary to-violet-700",
  "bg-gradient-to-br from-accent to-sky-700",
  "bg-gradient-to-br from-success to-emerald-700",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

type Props = {
  rank: number;
  name: string;
  subtitle?: string;
  orderCount: number;
  revenue: number;
};

export function DashboardEntityRow({ rank, name, subtitle, orderCount, revenue }: Props) {
  return (
    <tr className="border-b border-border/60 last:border-0 hover:bg-surface-2/40 transition-colors">
      <td className="py-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn("rank-badge", RANK_STYLES[rank] ?? RANK_STYLES[4])}>{rank + 1}</span>
          <span className={cn("entity-avatar", AVATAR_PALETTES[rank] ?? AVATAR_PALETTES[4])}>
            {initials(name)}
          </span>
          <div className="min-w-0">
            <div className="text-text-primary font-medium truncate">{name}</div>
            {subtitle ? (
              <div className="text-[10px] text-text-muted truncate">{subtitle}</div>
            ) : null}
          </div>
        </div>
      </td>
      <td className="py-2.5 text-right tabular-nums text-text-secondary font-medium">{orderCount}</td>
      <td className="py-2.5 text-right tabular-nums font-semibold text-text-primary">
        ₹{revenue.toLocaleString("en-IN")}
      </td>
    </tr>
  );
}
