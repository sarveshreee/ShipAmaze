import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useNdrOrders } from "@/hooks/useApiData";
import type { NdrRow } from "@/hooks/useApiData";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import {
  AlertTriangle,
  Download,
  Phone,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/exportUtils";
import * as ndrService from "@/services/ndrService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// ─── reason badge colours ────────────────────────────────────────────────────
const reasonColors: Record<string, string> = {
  "Not at Home": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  "Wrong Address": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Wrong address": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Fake Attempt": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  "Incomplete Address": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  NDR: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Otp Verified Cancellation": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  "Customer not available": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "Customer refused": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  "Phone not reachable": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  "COD amount issue": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  Other: "bg-surface-2 text-text-secondary",
};

function reasonBadgeClass(reason: string) {
  return reasonColors[reason] ?? "bg-surface-2 text-text-secondary";
}

function providerBadge(provider?: string) {
  if (provider === "lorrigo")
    return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300";
  return "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300";
}

function formatCurrency(n?: number) {
  if (n == null) return null;
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatAt(at: string) {
  if (!at) return "";
  try {
    return new Date(at).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return at;
  }
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({
  label,
  count,
  icon: Icon,
  color,
  active,
  onClick,
}: {
  label: string;
  count: number;
  icon: React.ElementType;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 rounded-xl border p-4 text-left transition-all w-full",
        active
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card hover:border-primary/40 hover:bg-surface-2/50"
      )}
    >
      <div className={cn("rounded-lg p-2.5", color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-text-primary">{count}</p>
        <p className="text-xs text-text-muted">{label}</p>
      </div>
    </button>
  );
}

// ─── Action modal ─────────────────────────────────────────────────────────────
type ActionType = "reattempt" | "return" | "fake-attempt";

function ActionModal({
  ndr,
  onClose,
  onDone,
}: {
  ndr: NdrRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [action, setAction] = useState<ActionType>(() => {
    const rec = ndr.recommendedAction;
    if (rec === "return") return "return";
    if (rec === "fake-attempt") return "fake-attempt";
    return "reattempt";
  });
  const [remarks, setRemarks] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [loading, setLoading] = useState(false);

  const supported = ndr.supportedActions ?? ["reattempt", "return"];

  const actionLabels: Record<ActionType, string> = {
    reattempt: "Re-attempt Delivery",
    return: "Force RTO (Return)",
    "fake-attempt": "Fake Attempt",
  };

  const actionDescriptions: Record<ActionType, string> = {
    reattempt: "Request the courier to make another delivery attempt for this order.",
    return:
      "Mark this shipment for return to origin (RTO). The order will be sent back to your warehouse.",
    "fake-attempt":
      "Report that a delivery attempt was logged falsely by the courier. Lorrigo will investigate.",
  };

  const actionColors: Record<ActionType, string> = {
    reattempt: "bg-primary text-primary-foreground hover:bg-primary/90",
    return: "bg-danger text-white hover:bg-danger/90",
    "fake-attempt": "bg-amber-600 text-white hover:bg-amber-700",
  };

  const submit = async () => {
    setLoading(true);
    try {
      const body: Parameters<typeof ndrService.submitNdrAction>[1] = {
        action,
        remarks:
          remarks.trim() ||
          (action === "reattempt"
            ? "Re-attempt requested via ShipAmaze NDR Management"
            : action === "fake-attempt"
              ? "Fake attempt reported via ShipAmaze NDR Management"
              : "RTO requested via ShipAmaze NDR Management"),
      };
      if (action === "reattempt" && nextDate) body.nextAttemptDate = nextDate;
      await ndrService.submitNdrAction(ndr.awb, body);
      toast.success(
        action === "reattempt"
          ? `Re-attempt submitted for ${ndr.awb}`
          : action === "fake-attempt"
            ? `Fake-attempt submitted for ${ndr.awb}`
            : `RTO initiated for ${ndr.awb}`
      );
      onDone();
    } catch (err: unknown) {
      toast.error(
        `NDR action failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Manage NDR
            <span className="font-mono text-sm font-normal text-text-muted">{ndr.awb}</span>
          </DialogTitle>
          <DialogDescription asChild>
            <div className="mt-2 rounded-lg border border-border bg-surface-2/50 p-3 text-left">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-text-primary">{ndr.customer || "—"}</p>
                  {ndr.phone && (
                    <a
                      href={`tel:${ndr.phone}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {ndr.phone}
                    </a>
                  )}
                </div>
                <div className="text-right">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      reasonBadgeClass(ndr.reason)
                    )}
                  >
                    {ndr.reason || "NDR"}
                  </span>
                  <p className="mt-1 text-xs text-text-muted">
                    {ndr.carrier || ""}{" "}
                    <span
                      className={cn(
                        "rounded px-1 py-0.5 text-[10px] capitalize",
                        providerBadge(ndr.courierProvider)
                      )}
                    >
                      {ndr.courierProvider ?? "velocity"}
                    </span>
                  </p>
                </div>
              </div>
              {ndr.customerRemarks && (
                <p className="mt-2 text-xs text-text-secondary italic">
                  &ldquo;{ndr.customerRemarks}&rdquo;
                </p>
              )}
              <div className="mt-2 flex gap-4 text-xs text-text-muted">
                <span>Attempts: {ndr.attempts}</span>
                {ndr.amount != null && <span>COD: {formatCurrency(ndr.amount)}</span>}
                <span>Updated: {ndr.lastUpdate}</span>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Action selector */}
          <div>
            <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-text-muted">
              Select Action
            </Label>
            <div className="grid gap-2">
              {(["reattempt", "return", "fake-attempt"] as ActionType[])
                .filter((a) => supported.includes(a))
                .map((a) => (
                  <button
                    key={a}
                    onClick={() => setAction(a)}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 text-left transition-all",
                      action === a
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30 hover:bg-surface-2/40"
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center",
                        action === a ? "border-primary" : "border-border"
                      )}
                    >
                      {action === a && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {actionLabels[a]}
                      </p>
                      <p className="text-xs text-text-muted">{actionDescriptions[a]}</p>
                    </div>
                  </button>
                ))}
            </div>
          </div>

          {/* Next attempt date */}
          {action === "reattempt" && (
            <div>
              <Label className="mb-1 block text-xs font-medium text-text-secondary">
                Next Attempt Date (optional)
              </Label>
              <Input
                type="date"
                value={nextDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setNextDate(e.target.value)}
                className="text-sm"
              />
            </div>
          )}

          {/* Remarks */}
          <div>
            <Label className="mb-1 block text-xs font-medium text-text-secondary">
              Remarks (optional)
            </Label>
            <Textarea
              placeholder="Add a note for the courier provider…"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={loading}
            className={cn(actionColors[action])}
          >
            {loading ? "Submitting…" : actionLabels[action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── History panel ────────────────────────────────────────────────────────────
function HistoryBadge({ ndr }: { ndr: NdrRow }) {
  const [open, setOpen] = useState(false);
  const history = ndr.actionHistory ?? [];
  if (!history.length && !ndr.actionStatus) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary transition-colors"
      >
        <Clock className="h-3 w-3" />
        {history.length} action{history.length !== 1 ? "s" : ""}
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-1 space-y-1 rounded-md border border-border bg-surface-2/60 p-2 text-[11px]">
          {history.map((h, i) => (
            <div key={i} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" />
              <span className="text-text-secondary">
                <span className="font-medium">{h.action}</span>
                {h.message ? ` — ${h.message}` : ""}
                <span className="ml-1 text-text-muted">{formatAt(h.at)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
const ALL_PROVIDERS = ["all", "lorrigo", "velocity"] as const;
type ProviderFilter = (typeof ALL_PROVIDERS)[number];

export default function AdminNDR() {
  const [tab, setTab] = useState<string>("Active");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [autoSynced, setAutoSynced] = useState(false);
  const [managingNdr, setManagingNdr] = useState<NdrRow | null>(null);

  const { data: ndrOrders = [], isLoading, refetch } = useNdrOrders();

  const runSync = useCallback(
    async (silent = false) => {
      setSyncing(true);
      try {
        const result = await ndrService.syncNdrFromProviders(120);
        if (!silent) {
          toast.success(
            `Synced ${result.upserted} NDR order${result.upserted === 1 ? "" : "s"}` +
              (result.errors > 0 ? ` (${result.errors} errors)` : "")
          );
        }
        await refetch();
        return result;
      } catch (err: unknown) {
        if (!silent) {
          toast.error(
            `NDR sync failed: ${err instanceof Error ? err.message : "Unknown error"}`
          );
        }
        return null;
      } finally {
        setSyncing(false);
      }
    },
    [refetch]
  );

  useEffect(() => {
    if (autoSynced || isLoading) return;
    setAutoSynced(true);
    void runSync(true);
  }, [autoSynced, isLoading, runSync]);

  const filtered = ndrOrders.filter((n) => {
    if (n.status !== tab) return false;
    if (providerFilter !== "all" && n.courierProvider !== providerFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [n.awb, n.customer, n.phone, n.seller, n.reason, n.nextAction, n.orderId, n.carrier]
      .some((v) => String(v ?? "").toLowerCase().includes(q));
  });

  const countFor = (s: string) => ndrOrders.filter((n) => n.status === s).length;

  const handleExport = () => {
    downloadCSV(
      "ndr_export",
      [
        "Order ID",
        "AWB",
        "Customer",
        "Phone",
        "Seller",
        "Courier",
        "Provider",
        "Reason",
        "Customer Remarks",
        "Attempts",
        "Amount",
        "Status",
        "Action Status",
        "Last Update",
      ],
      filtered.map((n) => [
        n.orderId ?? "",
        n.awb,
        n.customer,
        n.phone,
        n.seller,
        n.carrier ?? "",
        n.courierProvider ?? "velocity",
        n.reason,
        n.customerRemarks ?? "",
        n.attempts,
        n.amount ?? "",
        n.status,
        n.actionStatus ?? "",
        n.lastUpdate,
      ])
    );
    toast.success(`Exported ${filtered.length} NDR records`);
  };

  if (isLoading)
    return (
      <div className="animate-pulse space-y-4 p-8">
        <div className="h-8 w-48 rounded bg-surface-2" />
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-surface-2" />
          ))}
        </div>
        <div className="h-64 rounded-lg bg-surface-2" />
      </div>
    );

  return (
    <div className="animate-fade-in-up space-y-5">
      <PageHeader
        title="NDR Management"
        breadcrumb={["Admin", "NDR"]}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-2"
              disabled={syncing}
              onClick={() => void runSync(false)}
            >
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              {syncing ? "Syncing…" : "Sync NDR"}
            </Button>
            <Button onClick={handleExport} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Active — Needs Action"
          count={countFor("Active")}
          icon={AlertCircle}
          color="bg-amber-100 text-amber-600 dark:bg-amber-900/30"
          active={tab === "Active"}
          onClick={() => setTab("Active")}
        />
        <StatCard
          label="Initiated — Awaiting Courier"
          count={countFor("Initiated")}
          icon={Clock}
          color="bg-blue-100 text-blue-600 dark:bg-blue-900/30"
          active={tab === "Initiated"}
          onClick={() => setTab("Initiated")}
        />
        <StatCard
          label="Closed — Resolved"
          count={countFor("Closed")}
          icon={CheckCircle2}
          color="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30"
          active={tab === "Closed"}
          onClick={() => setTab("Closed")}
        />
      </div>

      {/* Alert banner */}
      {countFor("Active") > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-900/30 dark:bg-amber-900/10">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              {countFor("Active")} active NDR case{countFor("Active") !== 1 ? "s" : ""} require
              action
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              NDR syncs automatically every 10 minutes. Use "Sync NDR" for an immediate refresh.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Provider filter */}
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1">
          <Filter className="h-3.5 w-3.5 text-text-muted" />
          {ALL_PROVIDERS.map((p) => (
            <button
              key={p}
              onClick={() => setProviderFilter(p)}
              className={cn(
                "rounded px-2 py-0.5 text-xs font-medium capitalize transition-colors",
                providerFilter === p
                  ? "bg-primary text-primary-foreground"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {p === "all" ? "All Providers" : p}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input
            placeholder="Search AWB, customer, reason…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <p className="ml-auto text-sm text-text-muted">
          {filtered.length} record{filtered.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No NDR orders"
          description={
            ndrOrders.length === 0
              ? "No NDR orders synced yet. Click Sync NDR to pull open NDR shipments."
              : `No ${tab.toLowerCase()} NDR orders match the current filter`
          }
          actionLabel={ndrOrders.length === 0 ? "Sync NDR" : undefined}
          onAction={ndrOrders.length === 0 ? () => void runSync(false) : undefined}
        />
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Order / AWB
                </th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Customer
                </th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Courier
                </th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Reason / Remarks
                </th>
                <th className="p-3 text-center text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Attempts
                </th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Amount
                </th>
                <th className="p-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Last Update
                </th>
                <th className="p-3 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((n) => (
                <tr
                  key={n.awb}
                  className="border-b border-border/60 last:border-0 hover:bg-surface-2/30 transition-colors"
                >
                  {/* Order / AWB */}
                  <td className="p-3">
                    {n.orderId ? (
                      <p
                        className="font-mono text-[11px] text-text-secondary truncate max-w-[140px]"
                        title={n.orderId}
                      >
                        {n.orderId}
                      </p>
                    ) : null}
                    <p className="font-mono text-xs font-medium text-primary">{n.awb}</p>
                    {n.seller ? (
                      <p className="mt-0.5 text-[11px] text-text-muted">{n.seller}</p>
                    ) : null}
                  </td>

                  {/* Customer */}
                  <td className="p-3">
                    <p className="font-medium text-text-primary">{n.customer || "—"}</p>
                    {n.phone ? (
                      <a
                        href={`tel:${n.phone}`}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <Phone className="h-3 w-3" />
                        {n.phone}
                      </a>
                    ) : null}
                  </td>

                  {/* Courier */}
                  <td className="p-3">
                    <p className="text-text-secondary">{n.carrier || "—"}</p>
                    <span
                      className={cn(
                        "mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] capitalize font-medium",
                        providerBadge(n.courierProvider)
                      )}
                    >
                      {n.courierProvider ?? "velocity"}
                    </span>
                    {n.actionStatus === "provider_synced" ? (
                      <p className="mt-0.5 text-[11px] text-success flex items-center gap-1">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Synced
                      </p>
                    ) : null}
                  </td>

                  {/* Reason / Remarks */}
                  <td className="p-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        reasonBadgeClass(n.reason)
                      )}
                    >
                      {n.reason || "NDR"}
                    </span>
                    {n.customerRemarks ? (
                      <p
                        className="mt-1 max-w-[200px] text-[11px] text-text-muted italic truncate"
                        title={n.customerRemarks}
                      >
                        &ldquo;{n.customerRemarks}&rdquo;
                      </p>
                    ) : null}
                    <HistoryBadge ndr={n} />
                  </td>

                  {/* Attempts */}
                  <td className="p-3 text-center">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-text-primary">
                      {n.attempts}
                    </span>
                  </td>

                  {/* Amount */}
                  <td className="p-3 text-text-secondary">
                    {formatCurrency(n.amount) ?? (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>

                  {/* Last Update */}
                  <td className="p-3">
                    <p className="text-text-muted">{n.lastUpdate}</p>
                    {n.actionMessage ? (
                      <p
                        className="mt-0.5 max-w-[180px] text-[11px] text-text-secondary truncate"
                        title={n.actionMessage}
                      >
                        {n.actionMessage}
                      </p>
                    ) : null}
                  </td>

                  {/* Actions */}
                  <td className="p-3 text-right">
                    {n.status === "Active" ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          onClick={() => setManagingNdr(n)}
                        >
                          <Send className="h-3 w-3" />
                          Manage
                        </Button>
                        {n.phone && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            title={`Call ${n.phone}`}
                            onClick={() => window.open(`tel:${n.phone}`, "_self")}
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span
                        className={cn(
                          "inline-block rounded-full px-2.5 py-1 text-xs font-medium",
                          n.status === "Closed"
                            ? "bg-surface-2 text-text-muted"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        )}
                      >
                        {n.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Force RTO quick button on Initiated rows */}
      {tab === "Initiated" && filtered.length > 0 && (
        <p className="text-center text-xs text-text-muted">
          Initiated orders are awaiting courier action. Force RTO is available from the order
          details if needed.
        </p>
      )}

      {/* Action modal */}
      {managingNdr && (
        <ActionModal
          ndr={managingNdr}
          onClose={() => setManagingNdr(null)}
          onDone={async () => {
            setManagingNdr(null);
            await refetch();
          }}
        />
      )}
    </div>
  );
}
