import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import * as walletService from "@/services/walletService";
import type { AdminWalletRow, AdminTxRow } from "@/services/walletService";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
}

export default function AdminFinance() {
  const [wallets, setWallets] = useState<AdminWalletRow[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(true);
  const [walletsError, setWalletsError] = useState<string | null>(null);

  const [txFilterUser, setTxFilterUser] = useState("");
  const [txPage, setTxPage] = useState(1);
  const [txItems, setTxItems] = useState<AdminTxRow[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txLoading, setTxLoading] = useState(true);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustUserId, setAdjustUserId] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);

  const loadWallets = useCallback(async () => {
    setWalletsLoading(true);
    setWalletsError(null);
    try {
      const rows = await walletService.adminListWallets();
      setWallets(rows);
    } catch {
      setWalletsError("Could not load wallets");
      setWallets([]);
    } finally {
      setWalletsLoading(false);
    }
  }, []);

  useEffect(() => {
    setAdjustUserId((prev) => prev || (wallets[0]?.userId ?? ""));
  }, [wallets]);

  const loadTx = useCallback(async () => {
    setTxLoading(true);
    try {
      const r = await walletService.adminListWalletTransactions({
        page: txPage,
        pageSize: 25,
        userId: txFilterUser.trim() || undefined,
      });
      setTxItems(r.items);
      setTxTotal(r.total);
    } catch {
      setTxItems([]);
      setTxTotal(0);
      toast.error("Could not load transactions");
    } finally {
      setTxLoading(false);
    }
  }, [txPage, txFilterUser]);

  useEffect(() => {
    void loadWallets();
  }, [loadWallets]);

  useEffect(() => {
    void loadTx();
  }, [loadTx]);

  const totals = wallets.reduce((s, w) => s + (w.balance || 0), 0);

  const submitAdjust = async () => {
    const amt = Number(String(adjustAmount).replace(/,/g, ""));
    if (!adjustUserId) {
      toast.error("Select a user");
      return;
    }
    if (!Number.isFinite(amt) || amt === 0) {
      toast.error("Enter a non-zero amount (positive to credit, negative to debit)");
      return;
    }
    const reason = adjustReason.trim();
    if (reason.length < 3) {
      toast.error("Reason must be at least 3 characters");
      return;
    }
    setAdjustSaving(true);
    try {
      await walletService.adminAdjustWallet(adjustUserId, amt, reason);
      toast.success("Wallet adjusted");
      setAdjustOpen(false);
      setAdjustAmount("");
      setAdjustReason("");
      void loadWallets();
      void loadTx();
      window.dispatchEvent(new Event("shipamaze:refetch:wallet"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Adjustment failed");
    } finally {
      setAdjustSaving(false);
    }
  };

  return (
    <div className="animate-fade-in-up space-y-6">
      <PageHeader title="Finance & Wallet" breadcrumb={["Admin", "Finance"]} />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 shadow-card md:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Total wallet balance (all users)</p>
          {walletsLoading ? <Skeleton className="mt-2 h-8 w-32" /> : <p className="mt-2 text-2xl font-bold tabular-nums">{formatInr(totals)}</p>}
          <p className="mt-2 text-xs text-text-muted">Sum of vendor/dropshipper wallet documents.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5 shadow-card md:col-span-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Manual adjustment</p>
            <p className="text-xs text-text-muted mt-1">Creates a ledger entry and updates balance (no silent edits).</p>
          </div>
          <Button type="button" className="shrink-0 bg-primary text-primary-foreground hover:bg-primary-dark" onClick={() => setAdjustOpen(true)}>
            Adjust wallet
          </Button>
        </div>
      </div>

      {walletsError ? <p className="text-sm text-danger">{walletsError}</p> : null}

      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-semibold text-text-primary">User wallets</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadWallets()}>
            Refresh
          </Button>
        </div>
        {walletsLoading ? (
          <div className="p-6 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : wallets.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-muted">No wallets found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/40">
                  <th className="p-3 text-left font-medium text-text-secondary">User</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Role</th>
                  <th className="p-3 text-right font-medium text-text-secondary">Balance</th>
                </tr>
              </thead>
              <tbody>
                {wallets.map((w) => (
                  <tr key={w.userId} className="border-b border-border last:border-0">
                    <td className="p-3">
                      <p className="font-medium text-text-primary">{w.name || "—"}</p>
                      <p className="text-xs text-text-muted font-mono">{w.userId}</p>
                      <p className="text-xs text-text-muted">{w.email}</p>
                    </td>
                    <td className="p-3 text-text-secondary">{w.role}</td>
                    <td className="p-3 text-right font-medium tabular-nums">{formatInr(w.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="font-semibold text-text-primary">Transactions</h3>
            <p className="text-xs text-text-muted mt-1">Filter by Mongo user id (optional)</p>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <Label className="text-xs text-text-muted">userId</Label>
              <Input className="mt-1 w-56 font-mono text-xs" value={txFilterUser} onChange={(e) => setTxFilterUser(e.target.value)} placeholder="Filter…" />
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={() => { setTxPage(1); void loadTx(); }}>
              Apply
            </Button>
          </div>
        </div>
        {txLoading ? (
          <div className="p-6 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : txItems.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-muted">No transactions</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/40">
                  <th className="p-3 text-left font-medium text-text-secondary">User</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Date</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Description</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Type</th>
                  <th className="p-3 text-right font-medium text-text-secondary">Amount</th>
                  <th className="p-3 text-right font-medium text-text-secondary">Balance after</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Status</th>
                </tr>
              </thead>
              <tbody>
                {txItems.map((t) => (
                  <tr key={t.txnId} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                    <td className="p-3 font-mono text-xs text-text-muted max-w-[120px] truncate" title={t.userId}>
                      {t.userId ?? "—"}
                    </td>
                    <td className="p-3 text-text-muted whitespace-nowrap">{t.date || "—"}</td>
                    <td className="p-3 text-text-primary max-w-[280px] truncate" title={t.description}>
                      {t.description}
                    </td>
                    <td className="p-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          t.type === "Credit" ? "bg-success-light text-success-dark" : "bg-danger-light text-danger-dark"
                        )}
                      >
                        {t.type}
                      </span>
                    </td>
                    <td className={cn("p-3 text-right font-medium tabular-nums", t.type === "Credit" ? "text-success" : "text-danger")}>
                      {t.type === "Credit" ? "+" : "−"}
                      {formatInr(Math.abs(t.amount))}
                    </td>
                    <td className="p-3 text-right tabular-nums">{formatInr(t.balance)}</td>
                    <td className="p-3 capitalize text-xs">{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {txTotal > 25 ? (
          <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-text-muted">
            <span>
              Page {txPage} — {txTotal} total
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={txPage <= 1} onClick={() => setTxPage((p) => Math.max(1, p - 1))}>
                Prev
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={txPage * 25 >= txTotal} onClick={() => setTxPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust wallet</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>User</Label>
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={adjustUserId}
                onChange={(e) => setAdjustUserId(e.target.value)}
              >
                {wallets.map((w) => (
                  <option key={w.userId} value={w.userId}>
                    {w.name || w.email} — {formatInr(w.balance)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Amount (₹)</Label>
              <Input
                className="mt-1"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="e.g. 500 or -200"
              />
              <p className="text-[11px] text-text-muted mt-1">Positive credits the wallet; negative debits it.</p>
            </div>
            <div>
              <Label>Reason</Label>
              <Input className="mt-1" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Min 3 characters" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="secondary" onClick={() => setAdjustOpen(false)} disabled={adjustSaving}>
              Cancel
            </Button>
            <Button type="button" className="bg-primary text-primary-foreground" disabled={adjustSaving} onClick={() => void submitAdjust()}>
              {adjustSaving ? "Saving…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
