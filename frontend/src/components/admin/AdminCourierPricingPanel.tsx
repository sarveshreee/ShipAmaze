import { useMemo, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Copy,
  Loader2,
  MoreHorizontal,
  Percent,
  Save,
  Search,
  ToggleLeft,
  ToggleRight,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { formatRateAmount, normalizeZoneCode, parseRateCellInput } from "@/lib/shippingRateCardUtils";
import {
  DEFAULT_COURIERS,
  DEFAULT_WEIGHTS,
  DEFAULT_ZONES,
  type CourierZoneRow,
  type EnterpriseRateRow,
  copyCourierPricing,
  copyZoneAToAll,
  applyMargin,
  applyMarginEnterprise,
  setCourierActive,
} from "@/lib/courierPricingUtils";

type ViewMode = "matrix" | "enterprise";

type EditTarget =
  | { view: "matrix"; row: number; field: "rate"; wi: number }
  | { view: "matrix"; row: number; field: "cod" }
  | { view: "enterprise"; row: number; field: "zone"; zi: number };

type Props = {
  paymentType: "COD" | "Prepaid";
  onPaymentTypeChange: (t: "COD" | "Prepaid") => void;
  courierZoneRows: CourierZoneRow[];
  onCourierZoneRowsChange: (rows: CourierZoneRow[]) => void;
  enterpriseRows: EnterpriseRateRow[];
  onEnterpriseRowsChange: (rows: EnterpriseRateRow[]) => void;
  initialCourierZoneRows: CourierZoneRow[];
  initialEnterpriseRows: EnterpriseRateRow[];
  loading: boolean;
  saving: boolean;
  onSave: () => void;
  matrixOnly?: boolean;
  title?: string;
  subtitle?: string;
};

export function AdminCourierPricingPanel({
  paymentType,
  onPaymentTypeChange,
  courierZoneRows,
  onCourierZoneRowsChange,
  enterpriseRows,
  onEnterpriseRowsChange,
  initialCourierZoneRows,
  initialEnterpriseRows,
  loading,
  saving,
  onSave,
  matrixOnly = false,
  title = "Courier Rate Card",
  subtitle = "Courier-wise pricing matrix synced to dropshippers.",
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("matrix");
  const [courierFilter, setCourierFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [slabFilter, setSlabFilter] = useState<string>("all");
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [editValue, setEditValue] = useState("");
  const [bulkCourier, setBulkCourier] = useState<string>("Delhivery");
  const [copyTargetCourier, setCopyTargetCourier] = useState<string>("DTDC");
  const [marginPercent, setMarginPercent] = useState("10");

  const hasChanges =
    JSON.stringify({ courierZoneRows, enterpriseRows: matrixOnly ? [] : enterpriseRows }) !==
    JSON.stringify({
      courierZoneRows: initialCourierZoneRows,
      enterpriseRows: matrixOnly ? [] : initialEnterpriseRows,
    });

  const matrixDisplayRows = useMemo(() => {
    const byCourier = new Map<string, { row: CourierZoneRow; index: number }>();
    courierZoneRows.forEach((row, index) => {
      const key = row.courier.toLowerCase();
      const existing = byCourier.get(key);
      if (!existing || normalizeZoneCode(row.zone) === "A") {
        byCourier.set(key, { row, index });
      }
    });
    return [...byCourier.values()];
  }, [courierZoneRows]);

  const filteredMatrixRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return matrixDisplayRows
      .filter(({ row }) => {
        if (courierFilter !== "all" && row.courier !== courierFilter) return false;
        if (q && !row.courier.toLowerCase().includes(q)) return false;
        return true;
      });
  }, [matrixDisplayRows, courierFilter, search]);

  const filteredEnterpriseRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enterpriseRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        if (courierFilter !== "all" && row.courier !== courierFilter) return false;
        if (q && !`${row.courier} ${row.type} ${row.slab}`.toLowerCase().includes(q)) return false;
        return true;
      });
  }, [enterpriseRows, courierFilter, search]);

  const startEdit = (target: EditTarget, value: number) => {
    setEditing(target);
    setEditValue(String(value));
  };

  const commitEdit = useCallback(() => {
    if (!editing) return;
    const num = parseRateCellInput(editValue);
    if (num == null) {
      toast.error("Enter a valid rate ≥ 0");
      setEditing(null);
      return;
    }
    if (editing.view === "matrix") {
      const target = courierZoneRows[editing.row];
      const targetCourier = target?.courier;
      onCourierZoneRowsChange(
        courierZoneRows.map((r, i) => {
          if (!targetCourier || r.courier !== targetCourier) return r;
          if (editing.field === "cod") return { ...r, codCharge: num };
          const rates = [...r.rates];
          rates[editing.wi] = num;
          return { ...r, rates };
        })
      );
    } else {
      onEnterpriseRowsChange(
        enterpriseRows.map((r, i) => {
          if (i !== editing.row) return r;
          const zoneRates = [...r.zoneRates];
          zoneRates[editing.zi] = num;
          return { ...r, zoneRates };
        })
      );
    }
    setEditing(null);
  }, [editing, editValue, courierZoneRows, enterpriseRows, onCourierZoneRowsChange, onEnterpriseRowsChange]);

  const toggleMatrixActive = (rowIndex: number, active: boolean) => {
    const targetCourier = courierZoneRows[rowIndex]?.courier;
    onCourierZoneRowsChange(courierZoneRows.map((r, i) => (r.courier === targetCourier || i === rowIndex ? { ...r, active } : r)));
  };

  const runCopyZoneA = () => {
    const courier = bulkCourier === "all" ? undefined : bulkCourier;
    onCourierZoneRowsChange(copyZoneAToAll(courierZoneRows, courier));
    toast.success(courier ? `Displayed rates copied for ${courier}` : "Displayed rates copied for all couriers");
  };

  const runCopyCourier = () => {
    onCourierZoneRowsChange(copyCourierPricing(courierZoneRows, bulkCourier, copyTargetCourier));
    toast.success(`${bulkCourier} pricing copied to ${copyTargetCourier}`);
  };

  const runMargin = () => {
    const pct = Number(marginPercent);
    if (!Number.isFinite(pct)) {
      toast.error("Enter a valid margin %");
      return;
    }
    const courier = bulkCourier === "all" ? undefined : bulkCourier;
    onCourierZoneRowsChange(applyMargin(courierZoneRows, pct, courier));
    if (!matrixOnly) {
      onEnterpriseRowsChange(applyMarginEnterprise(enterpriseRows, pct, courier));
    }
    toast.success(`Applied ${pct > 0 ? "+" : ""}${pct}% margin`);
  };

  const runToggleCourier = (active: boolean) => {
    if (bulkCourier === "all") {
      toast.error("Select a courier for enable/disable");
      return;
    }
    onCourierZoneRowsChange(setCourierActive(courierZoneRows, bulkCourier, active));
    if (!matrixOnly) {
      onEnterpriseRowsChange(
        enterpriseRows.map((r) => (r.courier === bulkCourier ? { ...r, active } : r))
      );
    }
    toast.success(`${bulkCourier} ${active ? "enabled" : "disabled"}`);
  };

  const slabHighlight = slabFilter === "all" ? -1 : Number(slabFilter);
  const showAdvancedRateViews = false;

  return (
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      <div className="p-4 border-b border-border bg-surface-2/40 dark:bg-muted/20 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-text-primary flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              {title}
              <Badge variant="outline" className="font-normal text-xs">
                {paymentType}
              </Badge>
            </h3>
            <p className="text-xs text-text-muted mt-1">{subtitle}</p>
            {hasChanges && (
              <p className="text-xs text-amber-700 dark:text-amber-400 font-medium mt-1">Unsaved changes</p>
            )}
          </div>
          <Button size="sm" className="gap-1.5 shrink-0" disabled={!hasChanges || saving || loading} onClick={onSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Rates
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["Prepaid", "COD"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onPaymentTypeChange(t)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors",
                paymentType === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-text-secondary border-border hover:bg-surface-2/80"
              )}
            >
              {t}
            </button>
          ))}
          {showAdvancedRateViews && !matrixOnly && (
          <div className="flex rounded-lg border border-border overflow-hidden ml-auto">
            {(
              [
                { id: "matrix" as const, label: "Rate Matrix" },
                { id: "enterprise" as const, label: "FWD / RTO / REV" },
              ] as const
            ).map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setViewMode(v.id)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  viewMode === v.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-text-secondary hover:bg-surface-2/80"
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          )}
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
                {DEFAULT_COURIERS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-text-muted">Search</Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-text-muted" />
              <Input
                className="pl-8 h-9"
                placeholder="Courier or type…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          {viewMode === "matrix" && (
            <div>
              <Label className="text-xs text-text-muted">Weight slab highlight</Label>
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
          )}
          <div className="flex items-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-full gap-2">
                  <MoreHorizontal className="h-4 w-4" />
                  Bulk utilities
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <div className="px-2 py-2 space-y-2">
                  <Label className="text-xs">Target courier</Label>
                  <Select value={bulkCourier} onValueChange={setBulkCourier}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All couriers</SelectItem>
                      {DEFAULT_COURIERS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DropdownMenuItem onClick={runCopyZoneA}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy displayed rates to all lanes
                </DropdownMenuItem>
                <div className="px-2 py-2 space-y-2">
                  <Label className="text-xs">Copy to courier</Label>
                  <Select value={copyTargetCourier} onValueChange={setCopyTargetCourier}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEFAULT_COURIERS.filter((c) => c !== bulkCourier).map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DropdownMenuItem onClick={runCopyCourier} disabled={bulkCourier === "all"}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy courier pricing
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="px-2 py-2 flex gap-2 items-center">
                  <Input
                    className="h-8"
                    value={marginPercent}
                    onChange={(e) => setMarginPercent(e.target.value)}
                    placeholder="10"
                  />
                  <span className="text-xs text-text-muted">%</span>
                </div>
                <DropdownMenuItem onClick={runMargin}>
                  <Percent className="h-4 w-4 mr-2" />
                  Apply margin
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => runToggleCourier(true)}>
                  <ToggleRight className="h-4 w-4 mr-2" />
                  Enable courier
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => runToggleCourier(false)}>
                  <ToggleLeft className="h-4 w-4 mr-2" />
                  Disable courier
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-10 text-text-muted justify-center">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading pricing…
        </div>
      ) : viewMode === "matrix" || matrixOnly ? (
        <div className="overflow-x-auto max-h-[min(70vh,720px)]">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="sticky top-0 z-10 bg-surface-2/95 dark:bg-muted/90 backdrop-blur-sm">
              <tr className="border-b border-border">
                <th className="p-2 text-left font-medium text-text-secondary">Courier</th>
                {DEFAULT_WEIGHTS.map((w, i) => (
                  <th
                    key={w}
                    className={cn(
                      "p-2 text-center font-medium text-text-secondary",
                      slabHighlight === i && "bg-primary/10 text-primary"
                    )}
                  >
                    {w.replace(" kg", "kg")}
                  </th>
                ))}
                {paymentType === "COD" && (
                  <th className="p-2 text-center font-medium text-text-secondary">COD Charge</th>
                )}
                <th className="p-2 text-center font-medium text-text-secondary">Active</th>
              </tr>
            </thead>
            <tbody>
              {filteredMatrixRows.map(({ row, index: rowIndex }) => {
                const changed =
                  JSON.stringify(row) !== JSON.stringify(initialCourierZoneRows[rowIndex]);
                return (
                  <tr
                    key={`${row.courier}-${row.zone}-${rowIndex}`}
                    className={cn(
                      "border-b border-border last:border-0",
                      !row.active && "opacity-50",
                      changed && "bg-primary/5"
                    )}
                  >
                    <td className="p-2 font-medium text-text-primary whitespace-nowrap">{row.courier}</td>
                    {row.rates.map((rate, wi) => {
                      const isEditing =
                        editing?.view === "matrix" &&
                        editing.row === rowIndex &&
                        editing.field === "rate" &&
                        editing.wi === wi;
                      return (
                        <td
                          key={wi}
                          className={cn("p-1 text-center", slabHighlight === wi && "bg-primary/5")}
                        >
                          {isEditing ? (
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEdit();
                                if (e.key === "Escape") setEditing(null);
                              }}
                              autoFocus
                              className="w-16 h-8 text-center text-xs rounded-md border-2 border-primary bg-background outline-none"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEdit({ view: "matrix", row: rowIndex, field: "rate", wi }, rate)}
                              className="w-full h-8 rounded-md text-xs font-medium hover:bg-primary/10 hover:text-primary"
                            >
                              ₹{formatRateAmount(rate)}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    {paymentType === "COD" && (
                      <td className="p-1 text-center">
                        {editing?.view === "matrix" &&
                        editing.row === rowIndex &&
                        editing.field === "cod" ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            autoFocus
                            className="w-16 h-8 text-center text-xs rounded-md border-2 border-primary bg-background outline-none"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit({ view: "matrix", row: rowIndex, field: "cod" }, row.codCharge)}
                            className="w-full h-8 rounded-md text-xs font-medium hover:bg-primary/10"
                          >
                            ₹{formatRateAmount(row.codCharge)}
                          </button>
                        )}
                      </td>
                    )}
                    <td className="p-2 text-center">
                      <Switch checked={row.active} onCheckedChange={(v) => toggleMatrixActive(rowIndex, v)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[min(70vh,720px)]">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="sticky top-0 z-10 bg-surface-2/95 dark:bg-muted/90 backdrop-blur-sm">
              <tr className="border-b border-border">
                <th className="p-2 text-left font-medium text-text-secondary">Courier</th>
                <th className="p-2 text-left font-medium text-text-secondary">Type</th>
                <th className="p-2 text-left font-medium text-text-secondary">Slab</th>
                {DEFAULT_ZONES.map((z) => (
                  <th key={z} className="p-2 text-center font-medium text-text-secondary">
                    Zone {z}
                  </th>
                ))}
                <th className="p-2 text-center font-medium text-text-secondary">Active</th>
              </tr>
            </thead>
            <tbody>
              {filteredEnterpriseRows.map(({ row, index: rowIndex }) => (
                <tr
                  key={`${row.courier}-${row.type}-${row.slab}-${rowIndex}`}
                  className={cn("border-b border-border last:border-0", !row.active && "opacity-50")}
                >
                  <td className="p-2 font-medium whitespace-nowrap">{row.courier}</td>
                  <td className="p-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {row.type}
                    </Badge>
                  </td>
                  <td className="p-2 text-text-secondary">{row.slab}</td>
                  {row.zoneRates.map((rate, zi) => {
                    const isEditing =
                      editing?.view === "enterprise" &&
                      editing.row === rowIndex &&
                      editing.field === "zone" &&
                      editing.zi === zi;
                    return (
                      <td key={zi} className="p-1 text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit();
                              if (e.key === "Escape") setEditing(null);
                            }}
                            autoFocus
                            className="w-16 h-8 text-center text-xs rounded-md border-2 border-primary bg-background outline-none"
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              startEdit({ view: "enterprise", row: rowIndex, field: "zone", zi }, rate)
                            }
                            className="w-full h-8 rounded-md text-xs font-medium hover:bg-primary/10 hover:text-primary"
                          >
                            ₹{formatRateAmount(rate)}
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-2 text-center">
                    <Switch
                      checked={row.active}
                      onCheckedChange={(v) =>
                        onEnterpriseRowsChange(
                          enterpriseRows.map((r, i) => (i === rowIndex ? { ...r, active: v } : r))
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
