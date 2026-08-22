import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useNdrOrders } from "@/hooks/useApiData";
import type { NdrRow } from "@/hooks/useApiData";
import {
  AlertTriangle,
  Phone,
  RotateCcw,
  ArrowRight,
  Download,
  Search,
  RefreshCw,
  Send,
  Clock,
  CheckCircle2,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
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

const reasonColors: Record<string, string> = {
  "Not at Home": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  "Wrong Address": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Wrong address": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Fake Attempt": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  "Incomplete Address": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "Customer not available": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "Customer refused": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  "Phone not reachable": "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  "COD amount issue": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

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

// ─── History expand ───────────────────────────────────────────────────────────
function ActionHistory({ ndr }: { ndr: NdrRow }) {
  const [open, setOpen] = useState(false);
  const history = ndr.actionHistory ?? [];
  if (!history.length) return null;
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-secondary"
      >
        <Clock className="h-3 w-3" />
        {history.length} action{history.length !== 1 ? "s" : " taken"}
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-1 space-y-1 rounded-md border border-border bg-surface-2/50 p-2 text-[11px]">
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

// ─── Action modal ─────────────────────────────────────────────────────────────
type ActionType = "reattempt" | "return" | "fake-attempt";

function NdrActionModal({
  ndr,
  onClose,
  onDone,
}: {
  ndr: NdrRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const supported = ndr.supportedActions ?? ["reattempt", "return"];
  const [action, setAction] = useState<ActionType>(() =>
    supported.includes("reattempt") ? "reattempt" : (supported[0] as ActionType)
  );
  const [remarks, setRemarks] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [loading, setLoading] = useState(false);

  const actionLabels: Record<ActionType, string> = {
    reattempt: "Re-attempt Delivery",
    return: "Force RTO",
    "fake-attempt": "Report Fake Attempt",
  };
  const actionIcons: Record<ActionType, React.ElementType> = {
    reattempt: ArrowRight,
    return: RotateCcw,
    "fake-attempt": Send,
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
          ? "Re-attempt request submitted"
          : action === "fake-attempt"
            ? "Fake attempt reported"
            : "Return to origin initiated"
      );
      onDone();
    } catch (err: unknown) {
      toast.error(
        `Action failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>NDR Action</DialogTitle>
          <DialogDescription asChild>
            <div className="mt-2 rounded-lg border border-border bg-surface-2/50 p-3 text-left text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-text-primary">{ndr.customer || "—"}</p>
                  {ndr.phone && (
                    <a href={`tel:${ndr.phone}`} className="text-xs text-primary hover:underline">
                      {ndr.phone}
                    </a>
                  )}
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-medium",
                    reasonColors[ndr.reason] ?? "bg-surface-2 text-text-secondary"
                  )}
                >
                  {ndr.reason || "NDR"}
                </span>
              </div>
              {ndr.customerRemarks && (
                <p className="mt-2 text-xs italic text-text-muted">
                  &ldquo;{ndr.customerRemarks}&rdquo;
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                <span>AWB: {ndr.awb}</span>
                {ndr.orderId ? <span className="truncate max-w-[160px]">Order: {ndr.orderId}</span> : null}
                {ndr.payment ? <span>{ndr.payment}</span> : null}
                <span>Attempts: {ndr.attempts}</span>
                {ndr.amount != null && <span>Amount: {formatCurrency(ndr.amount)}</span>}
              </div>
              {(ndr.address || ndr.city || ndr.pincode) && (
                <p className="mt-1 text-[11px] text-text-muted leading-snug">
                  {[ndr.address, ndr.city, ndr.state, ndr.pincode].filter(Boolean).join(", ")}
                </p>
              )}
              {ndr.seller ? (
                <p className="mt-1 text-[11px] text-text-muted">Seller: {ndr.seller}</p>
              ) : null}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Action picker */}
          <div className="grid gap-2">
            {(["reattempt", "return", "fake-attempt"] as ActionType[])
              .filter((a) => supported.includes(a))
              .map((a) => {
                const Icon = actionIcons[a];
                return (
                  <button
                    key={a}
                    onClick={() => setAction(a)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition-all",
                      action === a
                        ? "border-primary bg-primary/5 text-text-primary"
                        : "border-border text-text-secondary hover:border-primary/30 hover:bg-surface-2/40"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-medium">{actionLabels[a]}</p>
                      {a === "fake-attempt" && (
                        <p className="text-[11px] text-text-muted">Lorrigo only</p>
                      )}
                    </div>
                    <div className="ml-auto">
                      <div
                        className={cn(
                          "h-4 w-4 rounded-full border-2",
                          action === a
                            ? "border-primary bg-primary"
                            : "border-border"
                        )}
                      />
                    </div>
                  </button>
                );
              })}
          </div>

          {action === "reattempt" && (
            <div>
              <Label className="mb-1 block text-xs font-medium text-text-secondary">
                Preferred Delivery Date (optional)
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

          <div>
            <Label className="mb-1 block text-xs font-medium text-text-secondary">
              Remarks (optional)
            </Label>
            <Textarea
              placeholder="Any instructions for the courier?"
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

// ─── NDR card ─────────────────────────────────────────────────────────────────
function NdrCard({ ndr, onManage }: { ndr: NdrRow; onManage: (n: NdrRow) => void }) {
  const supported = ndr.supportedActions ?? ["reattempt", "return"];
  const hasLorrigo = ndr.courierProvider === "lorrigo";

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card hover:shadow-card-md transition-shadow">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[180px]">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-mono text-xs font-medium text-primary">{ndr.awb}</span>
            {ndr.carrier && (
              <span className="text-[11px] text-text-muted">{ndr.carrier}</span>
            )}
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] capitalize font-medium",
                providerBadge(ndr.courierProvider)
              )}
            >
              {ndr.courierProvider ?? "velocity"}
            </span>
          </div>
          {ndr.orderId && (
            <p className="text-[11px] text-text-muted font-mono truncate max-w-[200px]">
              {ndr.orderId}
            </p>
          )}
          <p className="font-semibold text-text-primary mt-1">{ndr.customer || "—"}</p>
          {ndr.phone && (
            <a href={`tel:${ndr.phone}`} className="flex items-center gap-1 text-xs text-primary hover:underline mt-0.5">
              <Phone className="h-3 w-3" />
              {ndr.phone}
            </a>
          )}
          {(ndr.address || ndr.city || ndr.pincode) && (
            <p className="mt-1 text-[11px] text-text-muted leading-snug line-clamp-2">
              {[ndr.address, ndr.city, ndr.state, ndr.pincode].filter(Boolean).join(", ")}
            </p>
          )}
          {ndr.seller ? (
            <p className="mt-1 text-[11px] text-text-muted">Seller: {ndr.seller}</p>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              reasonColors[ndr.reason] ?? "bg-surface-2 text-text-secondary"
            )}
          >
            {ndr.reason || "NDR"}
          </span>
          {ndr.amount != null && (
            <span className="text-xs font-semibold text-text-primary">
              {formatCurrency(ndr.amount)}
            </span>
          )}
        </div>
      </div>

      {/* Customer remarks */}
      {ndr.customerRemarks && (
        <p className="mt-2 text-xs italic text-text-muted border-l-2 border-border pl-2">
          &ldquo;{ndr.customerRemarks}&rdquo;
        </p>
      )}

      {/* Meta */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
        <span>Attempt{ndr.attempts !== 1 ? "s" : ""}: <strong className="text-text-primary">{ndr.attempts}</strong></span>
        {ndr.payment ? <span>{ndr.payment}</span> : null}
        <span>Updated: {ndr.lastUpdate}</span>
        {ndr.actionStatus === "provider_synced" && (
          <span className="flex items-center gap-1 text-success">
            <CheckCircle2 className="h-3 w-3" />
            Courier notified
          </span>
        )}
      </div>

      {ndr.actionMessage && (
        <p className="mt-1 text-xs text-text-secondary">{ndr.actionMessage}</p>
      )}

      <ActionHistory ndr={ndr} />

      {/* Action row */}
      {ndr.status === "Active" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          {supported.includes("reattempt") && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => onManage(ndr)}
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Re-attempt
            </Button>
          )}
          {hasLorrigo && supported.includes("fake-attempt") && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400"
              onClick={() => onManage(ndr)}
            >
              <Send className="h-3.5 w-3.5" />
              Report Fake Attempt
            </Button>
          )}
          {ndr.phone && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => window.open(`tel:${ndr.phone}`, "_self")}
            >
              <Phone className="h-3.5 w-3.5" />
              Call
            </Button>
          )}
          {supported.includes("return") && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs border-danger/30 text-danger hover:bg-danger-light ml-auto"
              onClick={() => onManage(ndr)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Force RTO
            </Button>
          )}
        </div>
      )}

      {ndr.status !== "Active" && (
        <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              ndr.status === "Closed"
                ? "bg-surface-2 text-text-muted"
                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
            )}
          >
            {ndr.status}
          </span>
          {ndr.status === "Initiated" && (
            <span className="text-xs text-text-muted flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Awaiting courier
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
const TABS = ["all", "Active", "Initiated", "Closed"] as const;

export default function DropshipperNDR() {
  const [tab, setTab] = useState<string>("all");
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
        if (!silent) toast.success(`Synced ${result.upserted} NDR order(s)`);
        await refetch();
      } catch (err: unknown) {
        if (!silent)
          toast.error(`Sync failed: ${err instanceof Error ? err.message : "Unknown error"}`);
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
    if (tab !== "all" && n.status !== tab) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [n.customer, n.phone, n.awb, n.reason, n.seller, n.orderId, n.carrier].some(
      (val) => val && String(val).toLowerCase().includes(q)
    );
  });

  const countFor = (s: string) =>
    s === "all" ? ndrOrders.length : ndrOrders.filter((n) => n.status === s).length;

  const activeCount = countFor("Active");

  const handleExport = () => {
    downloadCSV(
      "ndr_export",
      ["AWB", "Order ID", "Customer", "Phone", "Address", "City", "Pincode", "Seller", "Courier", "Provider", "Payment", "Reason", "Attempts", "Amount", "Status", "Last Update"],
      filtered.map((n) => [
        n.awb,
        n.orderId ?? "",
        n.customer,
        n.phone,
        n.address ?? "",
        n.city ?? "",
        n.pincode ?? "",
        n.seller,
        n.carrier ?? "",
        n.courierProvider ?? "velocity",
        n.payment ?? "",
        n.reason,
        n.attempts,
        n.amount ?? "",
        n.status,
        n.lastUpdate,
      ])
    );
    toast.success(`Exported ${filtered.length} NDR records`);
  };

  if (isLoading)
    return (
      <div className="animate-pulse space-y-3 p-8">
        <div className="h-8 w-48 rounded bg-surface-2" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-surface-2" />
        ))}
      </div>
    );

  return (
    <div className="animate-fade-in-up space-y-4">
      <PageHeader
        title="NDR Management"
        breadcrumb={["Dropshipper", "NDR"]}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-2"
              disabled={syncing}
              onClick={() => void runSync(false)}
            >
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              {syncing ? "Syncing…" : "Sync"}
            </Button>
            <Button onClick={handleExport} variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Banner */}
      {activeCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-900/30 dark:bg-amber-900/10">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-800 dark:text-amber-300">
              {activeCount} NDR order{activeCount !== 1 ? "s" : ""} need your action
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Respond quickly to reduce RTO and improve your delivery rate.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "text-text-secondary hover:text-text-primary"
              )}
            >
              {t === "all" ? "All" : t}
              {countFor(t) > 0 && (
                <span
                  className={cn(
                    "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]",
                    tab === t ? "bg-white/20" : "bg-surface-2"
                  )}
                >
                  {countFor(t)}
                </span>
              )}
            </button>
          ))}
        </div>

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
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        search.trim() ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="h-10 w-10 text-text-muted mb-3" />
            <p className="font-medium text-text-primary">No results for &ldquo;{search}&rdquo;</p>
            <Button variant="link" className="mt-2" onClick={() => setSearch("")}>
              Clear search
            </Button>
          </div>
        ) : (
          <EmptyState
            icon={AlertTriangle}
            title="No NDR orders"
            description={
              ndrOrders.length === 0
                ? "No non-delivery reports yet. Sync to check for any pending NDRs."
                : "No NDR orders match the selected filter"
            }
            actionLabel={ndrOrders.length === 0 ? "Sync Now" : tab !== "all" ? "Show All" : undefined}
            onAction={
              ndrOrders.length === 0
                ? () => void runSync(false)
                : tab !== "all"
                  ? () => setTab("all")
                  : undefined
            }
          />
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-2">
          {filtered.map((n) => (
            <NdrCard key={n.awb} ndr={n} onManage={(ndr) => setManagingNdr(ndr)} />
          ))}
        </div>
      )}

      {/* Action modal */}
      {managingNdr && (
        <NdrActionModal
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
