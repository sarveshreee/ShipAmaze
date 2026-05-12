import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import * as invoiceService from "@/services/invoiceService";
import type { InvoiceDetail } from "@/services/invoiceService";
import type { Invoice } from "@/types/logistics";
import * as walletService from "@/services/walletService";
import type { CODRemittance } from "@/types/logistics";
import { FileText, Download, IndianRupee, Clock, CheckCircle2, AlertTriangle, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import { KPICard } from "@/components/KPICard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import * as reportsService from "@/services/reportsService";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const invoiceStatusColors: Record<string, string> = {
  Paid: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  Unpaid: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Overdue: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  Cancelled: "bg-surface-2 text-text-muted",
};

const codStatusColors: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Processing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Settled: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  "On Hold": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

export default function AdminBilling() {
  const [tab, setTab] = useState<"invoices" | "cod">("invoices");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invTotal, setInvTotal] = useState(0);
  const [invPage, setInvPage] = useState(1);
  const invPageSize = 25;
  const [invLoading, setInvLoading] = useState(true);
  const [invError, setInvError] = useState<string | null>(null);

  const [codRows, setCodRows] = useState<CODRemittance[]>([]);
  const [codTotal, setCodTotal] = useState(0);
  const [codPage, setCodPage] = useState(1);
  const codPageSize = 25;
  const [codLoading, setCodLoading] = useState(true);
  const [codError, setCodError] = useState<string | null>(null);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadInvoices = useCallback(async () => {
    setInvLoading(true);
    setInvError(null);
    try {
      const r = await invoiceService.listInvoices({
        page: String(invPage),
        pageSize: String(invPageSize),
        status: statusFilter !== "all" ? statusFilter : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setInvoices(r.items);
      setInvTotal(r.total);
    } catch (e) {
      setInvoices([]);
      setInvTotal(0);
      setInvError(e instanceof ApiError ? e.message : "Failed to load invoices");
    } finally {
      setInvLoading(false);
    }
  }, [invPage, statusFilter, dateFrom, dateTo]);

  const loadCod = useCallback(async () => {
    setCodLoading(true);
    setCodError(null);
    try {
      const r = await walletService.listCodRemittances({
        page: String(codPage),
        pageSize: String(codPageSize),
      });
      setCodRows(r.items);
      setCodTotal(r.total);
    } catch (e) {
      setCodRows([]);
      setCodTotal(0);
      setCodError(e instanceof ApiError ? e.message : "Failed to load COD remittances");
    } finally {
      setCodLoading(false);
    }
  }, [codPage]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    void loadCod();
  }, [loadCod]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    void (async () => {
      setDetailLoading(true);
      try {
        const d = await invoiceService.getInvoice(detailId);
        setDetail(d);
      } catch {
        setDetail(null);
        toast.error("Could not load invoice");
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [detailId]);

  const totalCOD = codRows.reduce((s, c) => s + c.codAmount, 0);
  const pendingCOD = codRows
    .filter((c) => c.status === "Pending" || c.status === "Processing")
    .reduce((s, c) => s + c.netPayable, 0);

  const overdueCount = invoices.filter((i) => i.status === "Overdue").length;

  const exportInvoicesCsv = async () => {
    try {
      await reportsService.downloadReportCsv("invoices", {
        status: statusFilter !== "all" ? statusFilter : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      toast.success("Invoice export started");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Export failed");
    }
  };

  const exportCodCsv = async () => {
    try {
      await reportsService.downloadReportCsv("cod", {});
      toast.success("COD export started");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Export failed");
    }
  };

  const exportWalletCsv = async () => {
    try {
      await reportsService.downloadReportCsv("wallet", {});
      toast.success("Wallet transactions export started");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Export failed");
    }
  };

  const invTotalPages = Math.max(1, Math.ceil(invTotal / invPageSize));
  const codTotalPages = Math.max(1, Math.ceil(codTotal / codPageSize));

  return (
    <div className="animate-fade-in-up space-y-4">
      <PageHeader title="Billing & Invoices" breadcrumb={["Admin", "Billing"]} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={FileText} label="Invoices (page)" value={String(invoices.length)} color="primary" />
        <KPICard icon={IndianRupee} label="COD (this page)" value={`₹${totalCOD.toLocaleString("en-IN")}`} color="success" />
        <KPICard icon={Clock} label="Pending COD (this page)" value={`₹${pendingCOD.toLocaleString("en-IN")}`} color="warning" />
        <KPICard icon={AlertTriangle} label="Overdue (this page)" value={String(overdueCount)} color="danger" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => void exportInvoicesCsv()}>
          <Download className="h-4 w-4 mr-1" /> Invoices CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => void exportCodCsv()}>
          <Download className="h-4 w-4 mr-1" /> COD CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => void exportWalletCsv()}>
          <Download className="h-4 w-4 mr-1" /> Wallet CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 border-b border-border">
          {(["invoices", "cod"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-[1px] transition-colors",
                tab === t ? "border-primary text-primary" : "border-transparent text-text-secondary"
              )}
            >
              {t === "cod" ? "COD Remittance" : "Invoices"}
            </button>
          ))}
        </div>
        {tab === "invoices" && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Input type="date" className="h-8 w-[140px] text-xs" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setInvPage(1); }} />
            <span className="text-text-muted text-xs">to</span>
            <Input type="date" className="h-8 w-[140px] text-xs" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setInvPage(1); }} />
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setInvPage(1); }}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
                <SelectItem value="Unpaid">Unpaid</SelectItem>
                <SelectItem value="Overdue">Overdue</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => void loadInvoices()}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        {tab === "cod" && (
          <div className="ml-auto">
            <Button variant="ghost" size="sm" className="h-8" onClick={() => void loadCod()}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {tab === "invoices" && invError && (
        <div className="rounded-lg border border-danger/30 bg-danger-light/20 px-4 py-3 text-sm flex justify-between gap-2">
          <span>{invError}</span>
          <Button size="sm" variant="outline" onClick={() => void loadInvoices()}>
            Retry
          </Button>
        </div>
      )}

      {tab === "cod" && codError && (
        <div className="rounded-lg border border-danger/30 bg-danger-light/20 px-4 py-3 text-sm flex justify-between gap-2">
          <span>{codError}</span>
          <Button size="sm" variant="outline" onClick={() => void loadCod()}>
            Retry
          </Button>
        </div>
      )}

      {tab === "invoices" && (
        <>
          {invLoading ? (
            <div className="flex items-center gap-2 p-8 text-text-muted">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : invoices.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-text-muted">
              No invoices for these filters
            </div>
          ) : (
            <div className="rounded-lg bg-card shadow-card overflow-x-auto border border-border">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b border-border bg-surface-2/50">
                    <th className="p-3 text-left font-medium text-text-secondary">Invoice</th>
                    <th className="p-3 text-left font-medium text-text-secondary">Date</th>
                    <th className="p-3 text-left font-medium text-text-secondary">Period</th>
                    <th className="p-3 text-right font-medium text-text-secondary">Amount</th>
                    <th className="p-3 text-left font-medium text-text-secondary">Status</th>
                    <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                      <td className="p-3 font-mono text-xs text-primary">{inv.id}</td>
                      <td className="p-3 text-text-muted">{inv.date}</td>
                      <td className="p-3 text-text-secondary">{inv.period}</td>
                      <td className="p-3 text-right font-medium text-text-primary">₹{inv.total.toLocaleString("en-IN")}</td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            invoiceStatusColors[inv.status] ?? "bg-surface-2 text-text-muted"
                          )}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDetailId(inv.id)}>
                            View
                          </Button>
                          {inv.downloadUrl && /^https?:\/\//i.test(inv.downloadUrl) && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                              <a href={inv.downloadUrl} target="_blank" rel="noopener noreferrer" title="Download">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            title="CSV"
                            onClick={() =>
                              void invoiceService.downloadInvoiceCsv(inv.id).then(
                                () => toast.success("Invoice CSV downloaded"),
                                (e) => toast.error(e instanceof ApiError ? e.message : "Failed")
                              )
                            }
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">
              Page {invPage} / {invTotalPages} · {invTotal} total
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={invPage <= 1} onClick={() => setInvPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={invPage >= invTotalPages} onClick={() => setInvPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      {tab === "cod" && (
        <>
          {codLoading ? (
            <div className="flex items-center gap-2 p-8 text-text-muted">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading…
            </div>
          ) : codRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-text-muted">
              No COD remittance rows
            </div>
          ) : (
            <div className="rounded-lg bg-card shadow-card overflow-x-auto border border-border">
              <table className="w-full text-sm min-w-[900px]">
                <thead>
                  <tr className="border-b border-border bg-surface-2/50">
                    <th className="p-3 text-left font-medium text-text-secondary">ID</th>
                    <th className="p-3 text-left font-medium text-text-secondary">Party</th>
                    <th className="p-3 text-right font-medium text-text-secondary">Orders</th>
                    <th className="p-3 text-right font-medium text-text-secondary">COD</th>
                    <th className="p-3 text-right font-medium text-text-secondary">Deductions</th>
                    <th className="p-3 text-right font-medium text-text-secondary">Net</th>
                    <th className="p-3 text-left font-medium text-text-secondary">Status</th>
                    <th className="p-3 text-left font-medium text-text-secondary">Settle</th>
                    <th className="p-3 text-left font-medium text-text-secondary">UTR</th>
                  </tr>
                </thead>
                <tbody>
                  {codRows.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                      <td className="p-3 font-mono text-xs text-primary">{c.id}</td>
                      <td className="p-3 text-text-primary">{c.dropshipper}</td>
                      <td className="p-3 text-right text-text-primary">{c.ordersCount}</td>
                      <td className="p-3 text-right font-medium text-text-primary">₹{c.codAmount.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-right text-danger">-₹{c.deductions.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-right font-medium text-success">₹{c.netPayable.toLocaleString("en-IN")}</td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-medium",
                            codStatusColors[c.status] ?? "bg-surface-2 text-text-muted"
                          )}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="p-3 text-text-muted">{c.settleDate || "—"}</td>
                      <td className="p-3 font-mono text-xs text-text-muted">{c.utr || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">
              Page {codPage} / {codTotalPages} · {codTotal} total
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={codPage <= 1} onClick={() => setCodPage((p) => p - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={codPage >= codTotalPages} onClick={() => setCodPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
          <p className="text-xs text-text-muted">
            Settlement actions are not enabled here (no payment gateway). Use finance operations and UTR updates via backend
            tools when available.
          </p>
        </>
      )}

      <Sheet open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-left pr-8">Invoice</SheetTitle>
          </SheetHeader>
          {detailLoading && <p className="text-sm text-text-muted mt-4">Loading…</p>}
          {!detailLoading && detail && (
            <div className="mt-4 space-y-3 text-sm">
              <p className="font-mono text-primary">{detail.invoiceId}</p>
              <p>
                <span className="text-text-muted">Period:</span> {detail.period}
              </p>
              <p>
                <span className="text-text-muted">Date:</span> {detail.date}
              </p>
              <p>
                <span className="text-text-muted">Orders:</span> {detail.ordersCount ?? detail.orders}
              </p>
              <p>
                <span className="text-text-muted">Shipping / COD / GST:</span> ₹{detail.shippingCharges} / ₹
                {detail.codCharges} / ₹{detail.gst}
              </p>
              <p className="text-lg font-semibold">Total: ₹{detail.total.toLocaleString("en-IN")}</p>
              <p>
                Status:{" "}
                <span className={cn("rounded-full px-2 py-0.5 text-xs", invoiceStatusColors[detail.status] ?? "")}>
                  {detail.status}
                </span>
              </p>
              {detail.pdfAvailable && detail.downloadUrl && (
                <Button variant="outline" size="sm" className="w-full gap-2" asChild>
                  <a href={detail.downloadUrl} target="_blank" rel="noopener noreferrer">
                    <Download className="h-4 w-4" /> Open file
                  </a>
                </Button>
              )}
              {!detail.pdfAvailable && (
                <p className="text-xs text-text-muted rounded-md border border-border p-2 bg-surface-2/30">
                  No hosted PDF for this invoice. Download CSV for accounting, or generate a stub record when PDF pipeline is
                  connected.
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void invoiceService.downloadInvoiceCsv(detail.invoiceId).then(
                      () => toast.success("CSV downloaded"),
                      () => toast.error("Download failed")
                    )
                  }
                >
                  <Download className="h-4 w-4 mr-1" /> CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void invoiceService.generateInvoiceStub(detail.invoiceId).then(
                      (r) => toast.message(r.message),
                      () => toast.error("Request failed")
                    )
                  }
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Check PDF pipeline
                </Button>
              </div>
              <div className="border-t border-border pt-3 space-y-2">
                <p className="text-xs font-medium text-text-muted">Admin: set status</p>
                <div className="flex flex-wrap gap-2">
                  {(["Paid", "Unpaid", "Overdue", "Cancelled"] as const).map((st) => (
                    <Button
                      key={st}
                      size="sm"
                      variant={detail.status === st ? "default" : "outline"}
                      className="text-xs h-7"
                      onClick={() =>
                        void invoiceService.patchInvoiceStatus(detail.invoiceId, st).then(
                          async () => {
                            toast.success("Updated");
                            setDetail(await invoiceService.getInvoice(detail.invoiceId));
                            void loadInvoices();
                          },
                          (e) => toast.error(e instanceof ApiError ? e.message : "Failed")
                        )
                      }
                    >
                      {st}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
