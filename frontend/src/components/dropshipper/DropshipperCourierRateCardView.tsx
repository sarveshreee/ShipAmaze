import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Loader2, RefreshCw, Search } from "lucide-react";
import {
  DEFAULT_COURIERS,
  DEFAULT_WEIGHTS,
  type CourierZoneRow,
} from "@/lib/courierPricingUtils";
import { formatRateAmount, normalizeZoneCode } from "@/lib/shippingRateCardUtils";

type Props = {
  paymentType: "COD" | "Prepaid";
  onPaymentTypeChange: (v: "COD" | "Prepaid") => void;
  rows: CourierZoneRow[];
  loading: boolean;
  error: string | null;
  updatedAt?: string | null;
  onRefresh: () => void;
};

export function DropshipperCourierRateCardView({
  paymentType,
  onPaymentTypeChange,
  rows,
  loading,
  error,
  updatedAt,
  onRefresh,
}: Props) {
  const [courierFilter, setCourierFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [slabFilter, setSlabFilter] = useState("all");

  const couriersInData = useMemo(() => {
    const set = new Set(rows.map((r) => r.courier));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const displayRows = useMemo(() => {
    const byCourier = new Map<string, CourierZoneRow>();
    rows.forEach((row) => {
      if (row.active === false) return;
      const key = row.courier.toLowerCase();
      const existing = byCourier.get(key);
      if (!existing || normalizeZoneCode(row.zone) === "A") {
        byCourier.set(key, row);
      }
    });
    return [...byCourier.values()];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return displayRows.filter((r) => {
      if (courierFilter !== "all" && r.courier !== courierFilter) return false;
      if (q && !r.courier.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [displayRows, courierFilter, search]);

  const courierOptions = couriersInData.length ? couriersInData : [...DEFAULT_COURIERS];

  return (
    <div className="rounded-lg bg-card shadow-card overflow-hidden">
      <div className="p-4 border-b border-border space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-text-primary">Courier Rate Matrix</h3>
            <p className="text-xs text-text-muted mt-0.5">
              View-only — synced from admin saved rates{updatedAt ? ` · Updated ${new Date(updatedAt).toLocaleString()}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(["Prepaid", "COD"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onPaymentTypeChange(t)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    paymentType === t
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-text-secondary hover:bg-surface-2/80"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={onRefresh}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs text-text-muted">Courier filter</Label>
            <Select value={courierFilter} onValueChange={setCourierFilter}>
              <SelectTrigger className="h-9 mt-1">
                <SelectValue placeholder="All couriers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All couriers</SelectItem>
                {courierOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-text-muted">Search courier</Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-text-muted" />
              <Input
                className="pl-8 h-9"
                placeholder="Courier…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-text-muted">Weight slab filter</Label>
            <Select value={slabFilter} onValueChange={setSlabFilter}>
              <SelectTrigger className="h-9 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All slabs</SelectItem>
                {DEFAULT_WEIGHTS.map((w, i) => (
                  <SelectItem key={w} value={String(i)}>
                    {w}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-8 text-text-muted">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="p-8 text-center text-sm text-danger">{error}</div>
      ) : !filteredRows.length ? (
        <div className="p-8 text-center text-sm text-text-muted">No courier rates configured yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="p-3 text-left font-medium text-text-secondary sticky left-0 bg-surface-2/95 z-10">Courier</th>
                {DEFAULT_WEIGHTS.map((w, i) => (
                  <th
                    key={w}
                    className={cn(
                      "p-3 text-center font-medium text-text-secondary",
                      slabFilter !== "all" && slabFilter === String(i) && "bg-primary/10 text-primary"
                    )}
                  >
                    {w.replace(" kg", "kg")}
                  </th>
                ))}
                {paymentType === "COD" && (
                  <th className="p-3 text-center font-medium text-text-secondary">COD charge</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, i) => (
                <tr key={row.courier} className={cn("border-b border-border", i % 2 === 0 && "bg-surface-2/20")}>
                  <td className="p-3 font-medium text-text-primary sticky left-0 bg-card z-[1]">{row.courier}</td>
                  {DEFAULT_WEIGHTS.map((_, wi) => (
                    <td
                      key={wi}
                      className={cn(
                        "p-3 text-center text-text-primary",
                        slabFilter !== "all" && slabFilter === String(wi) && "bg-primary/5 font-semibold"
                      )}
                    >
                      ₹{formatRateAmount(row.rates[wi] ?? 0)}
                    </td>
                  ))}
                  {paymentType === "COD" && (
                    <td className="p-3 text-center text-text-primary">₹{formatRateAmount(row.codCharge ?? 0)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
