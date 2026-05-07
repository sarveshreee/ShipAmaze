import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { useTransactions, useWalletSummary } from "@/hooks/useApiData";
import { Button } from "@/components/ui/button";
import { Plus, ArrowUpRight, Wallet, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddFundsModal } from "@/components/AddFundsModal";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Transaction, WalletTxnDisplayType } from "@/types/logistics";
import { Skeleton } from "@/components/ui/skeleton";

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return "—";
  }
}

function typeBadgeClass(dt: WalletTxnDisplayType) {
  if (dt === "Credit" || dt === "Recharge") return "bg-success-light text-success-dark";
  if (dt === "COD") return "bg-primary-light text-primary-dark";
  if (dt === "Deduction" || dt === "Debit") return "bg-danger-light text-danger-dark";
  if (dt === "Adjustment") return "bg-surface-2 text-text-primary border border-border";
  return "bg-surface-2 text-text-secondary";
}

function statusBadgeClass(s: string) {
  if (s === "pending") return "bg-amber-50 text-amber-800 border border-amber-200";
  if (s === "failed") return "bg-danger-light text-danger-dark";
  return "bg-surface-2 text-text-secondary border border-border";
}

export default function DropshipperWallet() {
  const { role } = useAuth();
  const { data: transactions = [], isLoading: txLoading, refetch: refetchTx } = useTransactions();
  const { data: summary, isLoading: sumLoading, error: sumError, refetch: refetchSum } = useWalletSummary();
  const [addOpen, setAddOpen] = useState(false);

  const loading = sumLoading || txLoading;

  const onFundsSuccess = () => {
    void refetchTx();
    void refetchSum();
  };

  return (
    <div className="animate-fade-in-up space-y-6">
      <PageHeader
        title="Wallet"
        breadcrumb={[
          role === "vendor" ? "Vendor" : "Dropshipper",
          "Wallet",
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div
          className="rounded-xl border border-border bg-card p-5 shadow-card md:col-span-2 xl:col-span-2 text-left transition-shadow hover:shadow-card-md cursor-pointer focus-within:ring-2 focus-within:ring-primary/40"
          onClick={() => setAddOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setAddOpen(true);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Open add balance"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Available balance</p>
              {loading ? (
                <Skeleton className="mt-2 h-9 w-40" />
              ) : (
                <p className="mt-2 text-3xl font-bold tabular-nums text-text-primary">
                  {sumError ? "—" : formatInr(summary?.balance ?? 0)}
                </p>
              )}
              <p className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                Last sync: {summary ? formatWhen(summary.lastSyncedAt) : loading ? "…" : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
              <Wallet className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button className="bg-primary text-primary-foreground hover:bg-primary-dark" type="button" onClick={(e) => { e.stopPropagation(); setAddOpen(true); }} onKeyDown={(e) => e.stopPropagation()}>
              <Plus className="h-4 w-4 mr-2" />
              Add balance
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button variant="outline" type="button" disabled className="pointer-events-none opacity-60">
                    <ArrowUpRight className="h-4 w-4 mr-2" />
                    Withdraw
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-center">
                Withdrawals will be available after KYC/bank verification
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Pending COD</p>
          {loading ? <Skeleton className="mt-2 h-8 w-28" /> : <p className="mt-2 text-2xl font-semibold tabular-nums">{formatInr(summary?.pendingCod ?? 0)}</p>}
          <p className="mt-2 text-xs text-text-muted">From remittances in pending or processing state.</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-card">
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Totals</p>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 text-text-secondary">
                <TrendingUp className="h-3.5 w-3.5 text-success" />
                Total credits
              </span>
              {loading ? <Skeleton className="h-4 w-20" /> : <span className="font-medium tabular-nums">{formatInr(summary?.totalCredits ?? summary?.totalRecharge ?? 0)}</span>}
            </div>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 text-text-secondary">
                <TrendingDown className="h-3.5 w-3.5 text-danger" />
                Total debits
              </span>
              {loading ? <Skeleton className="h-4 w-20" /> : <span className="font-medium tabular-nums">{formatInr(summary?.totalDebits ?? summary?.totalDeductions ?? 0)}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <div className="flex flex-col gap-1 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-text-primary">Transactions</h3>
            <p className="text-xs text-text-muted">All wallet movements from your account</p>
          </div>
        </div>

        {sumError ? (
          <div className="px-5 py-8 text-center text-sm text-danger">Could not load wallet summary. Please try again.</div>
        ) : null}
        {txLoading ? (
          <div className="p-8 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="px-5 py-16 text-center text-sm text-text-muted">No wallet transactions yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/40">
                  <th className="p-3 text-left font-medium text-text-secondary">Date</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Description</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Type</th>
                  <th className="p-3 text-right font-medium text-text-secondary">Amount</th>
                  <th className="p-3 text-right font-medium text-text-secondary">Balance before</th>
                  <th className="p-3 text-right font-medium text-text-secondary">Balance after</th>
                  <th className="p-3 text-left font-medium text-text-secondary">Status</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t: Transaction) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                    <td className="p-3 text-text-muted whitespace-nowrap">{t.date || "—"}</td>
                    <td className="p-3 text-text-primary max-w-[240px] truncate" title={t.description}>
                      {t.description}
                    </td>
                    <td className="p-3">
                      <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", typeBadgeClass(t.displayType))}>
                        {t.displayType}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "p-3 text-right font-medium tabular-nums whitespace-nowrap",
                        t.type === "Credit" ? "text-success" : "text-danger"
                      )}
                    >
                      {t.type === "Credit" ? "+" : "−"}
                      {formatInr(Math.abs(t.amount))}
                    </td>
                    <td className="p-3 text-right tabular-nums text-text-muted whitespace-nowrap">
                      {t.balanceBefore != null ? formatInr(t.balanceBefore) : "—"}
                    </td>
                    <td className="p-3 text-right tabular-nums text-text-primary whitespace-nowrap">{formatInr(t.balance)}</td>
                    <td className="p-3">
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize", statusBadgeClass(t.status))}>
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddFundsModal open={addOpen} onOpenChange={setAddOpen} onSuccess={onFundsSuccess} />
    </div>
  );
}
