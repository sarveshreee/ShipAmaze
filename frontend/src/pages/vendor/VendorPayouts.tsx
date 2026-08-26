import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  IndianRupee, CalendarClock, TrendingUp, Search, Download, Eye, FileText, CheckCircle2, Clock, Wallet,
  Loader2, AlertCircle, RefreshCw, Pencil, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useCodRemittances,
  useGstRecords,
  useWalletSummary,
  usePayoutSummaryOverrides,
} from "@/hooks/useApiData";
import { usePermissions } from "@/hooks/usePermissions";
import { downloadCSV } from "@/lib/exportUtils";
import { queryKeys } from "@/lib/queryClient";
import * as walletService from "@/services/walletService";
import type { CODRemittance } from "@/types/logistics";
import type { UserRole } from "@/services/authService";
import type { GstRecord, PayoutSummaryOverrides } from "@/services/walletService";

const fmtINR = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function roleLabel(role: UserRole | null | undefined): string {
  if (role === "vendor") return "Vendor";
  if (role === "dropshipper") return "Dropshipper";
  return "Account";
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(d);
  } catch {
    return iso;
  }
}

function isSettled(status: CODRemittance["status"]): boolean {
  return status === "Settled";
}

function isPending(status: CODRemittance["status"]): boolean {
  return status === "Pending" || status === "Processing" || status === "On Hold";
}

type OverrideField =
  | "nextCodOn"
  | "pendingCod"
  | "upcomingPayouts"
  | "totalSettled"
  | "pendingSettlement"
  | "last7Days"
  | "last30Days";

type EditTarget = {
  field: OverrideField;
  label: string;
  kind: "money" | "text";
  autoValue: string;
};

function pickOverrideNum(override: number | null | undefined, auto: number): number {
  return override != null && Number.isFinite(override) ? override : auto;
}

function pickOverrideText(override: string | null | undefined, auto: string): string {
  return override != null && String(override).trim() !== "" ? String(override) : auto;
}

export default function VendorPayouts() {
  const { role, isImpersonating, userId } = useAuth();
  const qc = useQueryClient();
  const { canViewGST, canViewRemittance } = usePermissions();
  const { data: remittances = [], isLoading: remLoading, isError: remError, refetch: refetchRem } = useCodRemittances();
  const { data: gstRecords = [], isLoading: gstLoading, isError: gstError, refetch: refetchGst } = useGstRecords();
  const { data: wallet, isLoading: walletLoading, error: walletError, refetch: refetchWallet } = useWalletSummary();
  const { data: overrides, refetch: refetchOverrides } = usePayoutSummaryOverrides();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [remStatusFilter, setRemStatusFilter] = useState<string>("all");
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingGst, setUploadingGst] = useState(false);
  const gstFileRef = useRef<HTMLInputElement>(null);

  const panelLabel = roleLabel(role);
  const showAdminEdit = isImpersonating;

  const autoCodStats = useMemo(() => {
    const pendingRows = remittances.filter((r) => isPending(r.status));
    const nextPending = pendingRows[0];
    const upcomingTotal = pendingRows.reduce((s, r) => s + r.netPayable, 0);

    return {
      nextCodOn: nextPending?.settleDate ? formatDate(nextPending.settleDate) : "—",
      nextCodAmount: wallet?.pendingCod ?? upcomingTotal,
      upcomingCod: upcomingTotal,
    };
  }, [remittances, wallet?.pendingCod]);

  const autoRemittanceSummary = useMemo(() => {
    const totalSettled = remittances.filter((r) => isSettled(r.status)).reduce((s, r) => s + r.netPayable, 0);
    const pending = remittances.filter((r) => isPending(r.status)).reduce((s, r) => s + r.netPayable, 0);
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 30);

    const inRange = (r: CODRemittance, from: Date) => {
      const d = new Date(r.settleDate);
      return !Number.isNaN(d.getTime()) && d >= from;
    };

    const thisWeek = remittances.filter((r) => inRange(r, weekAgo)).reduce((s, r) => s + r.netPayable, 0);
    const thisMonth = remittances.filter((r) => inRange(r, monthAgo)).reduce((s, r) => s + r.netPayable, 0);

    return { totalSettled, pending, thisWeek, thisMonth };
  }, [remittances]);

  const displayCodStats = useMemo(
    () => ({
      nextCodOn: pickOverrideText(overrides?.nextCodOn, autoCodStats.nextCodOn),
      nextCodAmount: pickOverrideNum(overrides?.pendingCod, autoCodStats.nextCodAmount),
      upcomingCod: pickOverrideNum(overrides?.upcomingPayouts, autoCodStats.upcomingCod),
    }),
    [overrides, autoCodStats]
  );

  const displayRemittanceSummary = useMemo(
    () => ({
      totalSettled: pickOverrideNum(overrides?.totalSettled, autoRemittanceSummary.totalSettled),
      pending: pickOverrideNum(overrides?.pendingSettlement, autoRemittanceSummary.pending),
      thisWeek: pickOverrideNum(overrides?.last7Days, autoRemittanceSummary.thisWeek),
      thisMonth: pickOverrideNum(overrides?.last30Days, autoRemittanceSummary.thisMonth),
    }),
    [overrides, autoRemittanceSummary]
  );

  const filteredGst = useMemo(() => {
    return gstRecords.filter((r) => {
      if (statusFilter !== "all" && r.status.toLowerCase() !== statusFilter) return false;
      if (paymentFilter !== "all" && r.payment.toLowerCase() !== paymentFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return r.orderId.toLowerCase().includes(q) || r.customer.toLowerCase().includes(q);
      }
      return true;
    });
  }, [gstRecords, search, statusFilter, paymentFilter]);

  const filteredRemittances = useMemo(() => {
    return remittances.filter((r) => {
      if (remStatusFilter !== "all" && r.status.toLowerCase() !== remStatusFilter.toLowerCase()) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return r.id.toLowerCase().includes(q) || (r.utr ?? "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [remittances, remStatusFilter, search]);

  const defaultTab = canViewRemittance ? "remittance" : "gst";
  const showGstTab = canViewGST;
  const showRemTab = canViewRemittance;

  const handleRefresh = () => {
    void refetchRem();
    void refetchWallet();
    void refetchGst();
    void refetchOverrides();
  };

  const openEdit = (target: EditTarget) => {
    setEditTarget(target);
    const current =
      target.field === "nextCodOn"
        ? displayCodStats.nextCodOn
        : target.field === "pendingCod"
          ? String(displayCodStats.nextCodAmount)
          : target.field === "upcomingPayouts"
            ? String(displayCodStats.upcomingCod)
            : target.field === "totalSettled"
              ? String(displayRemittanceSummary.totalSettled)
              : target.field === "pendingSettlement"
                ? String(displayRemittanceSummary.pending)
                : target.field === "last7Days"
                  ? String(displayRemittanceSummary.thisWeek)
                  : String(displayRemittanceSummary.thisMonth);
    setEditValue(current === "—" ? "" : current.replace(/[₹,]/g, ""));
  };

  const saveEdit = async (clear = false) => {
    if (!editTarget) return;
    setSavingEdit(true);
    try {
      const field = editTarget.field;
      const patch: Record<string, string | number | null> = {};
      if (clear) {
        patch[field] = null;
      } else if (editTarget.kind === "text") {
        patch[field] = editValue.trim() || null;
      } else {
        const n = Number(String(editValue).replace(/[₹,\s]/g, ""));
        if (!Number.isFinite(n)) {
          toast.error("Enter a valid number");
          setSavingEdit(false);
          return;
        }
        patch[field] = n;
      }
      await walletService.savePayoutSummaryOverrides(
        patch as Partial<Omit<PayoutSummaryOverrides, "updatedAt">>
      );
      await qc.invalidateQueries({ queryKey: queryKeys.payoutOverrides(userId) });
      toast.success(clear ? "Reset to automatic value" : "Saved — visible to the user");
      setEditTarget(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSavingEdit(false);
    }
  };

  const onGstFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadingGst(true);
    try {
      const res = await walletService.uploadGstExcel(file, true);
      await qc.invalidateQueries({ queryKey: queryKeys.gstRecords(userId) });
      toast.success(res.message ?? `Imported GST rows`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingGst(false);
      if (gstFileRef.current) gstFileRef.current.value = "";
    }
  };

  const exportGst = () => {
    downloadCSV(
      "gst_export",
      ["Order ID", "Date", "Customer", "Amount", "GST %", "GST Amount", "Taxable", "Total", "Payment", "Status"],
      filteredGst.map((r) => [
        r.orderId,
        r.date,
        r.customer,
        r.amount,
        r.gstPct,
        r.gstAmount,
        r.taxableValue,
        r.total,
        r.payment,
        r.status,
      ])
    );
    toast.success(`Exported ${filteredGst.length} GST records`);
  };

  const exportRemittances = () => {
    downloadCSV(
      "payout_statement",
      ["Remittance ID", "Settlement Date", "Orders", "COD Amount", "Deductions", "Net Payable", "Status", "UTR"],
      filteredRemittances.map((r) => [
        r.id,
        r.settleDate,
        r.ordersCount,
        r.codAmount,
        r.deductions,
        r.netPayable,
        r.status,
        r.utr ?? "",
      ])
    );
    toast.success(`Exported ${filteredRemittances.length} payout rows`);
  };

  const EditBtn = ({ target }: { target: EditTarget }) =>
    showAdminEdit ? (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs gap-1"
        onClick={() => openEdit(target)}
      >
        <Pencil className="h-3 w-3" /> Edit
      </Button>
    ) : null;

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Payouts"
        breadcrumb={[panelLabel, "Payouts"]}
        actions={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {walletLoading || remLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border-border">
              <CardContent className="p-5">
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-3 w-40" />
              </CardContent>
            </Card>
          ))
        ) : walletError ? (
          <Card className="border-border sm:col-span-2 lg:col-span-3">
            <CardContent className="p-5 flex items-center gap-3 text-danger">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Could not load payout summary</p>
                <Button variant="link" className="h-auto p-0 text-primary" onClick={() => void refetchWallet()}>
                  Try again
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-border">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Next COD On</p>
                    <p className="mt-2 text-2xl font-semibold text-text-primary">{displayCodStats.nextCodOn}</p>
                    <p className="mt-1 text-xs text-text-secondary">Scheduled settlement date</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light">
                      <CalendarClock className="h-5 w-5 text-primary" />
                    </div>
                    <EditBtn
                      target={{
                        field: "nextCodOn",
                        label: "Next COD On",
                        kind: "text",
                        autoValue: autoCodStats.nextCodOn,
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Pending COD</p>
                    <p className="mt-2 text-2xl font-semibold text-text-primary">{fmtINR(displayCodStats.nextCodAmount)}</p>
                    <p className="mt-1 text-xs text-text-secondary">Awaiting next settlement</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-light">
                      <IndianRupee className="h-5 w-5 text-success" />
                    </div>
                    <EditBtn
                      target={{
                        field: "pendingCod",
                        label: "Pending COD",
                        kind: "money",
                        autoValue: fmtINR(autoCodStats.nextCodAmount),
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Upcoming Payouts</p>
                    <p className="mt-2 text-2xl font-semibold text-text-primary">{fmtINR(displayCodStats.upcomingCod)}</p>
                    <p className="mt-1 text-xs text-text-secondary">Across pending cycles</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-light">
                      <TrendingUp className="h-5 w-5 text-warning" />
                    </div>
                    <EditBtn
                      target={{
                        field: "upcomingPayouts",
                        label: "Upcoming Payouts",
                        kind: "money",
                        autoValue: fmtINR(autoCodStats.upcomingCod),
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className={cn("grid w-full max-w-md", showGstTab && showRemTab ? "grid-cols-2" : "grid-cols-1")}>
          {showGstTab && <TabsTrigger value="gst">GST Data</TabsTrigger>}
          {showRemTab && <TabsTrigger value="remittance">Remittance</TabsTrigger>}
        </TabsList>

        {showGstTab && (
          <TabsContent value="gst" className="mt-4">
            <Card className="border-border">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">GST Data</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                    <Input
                      placeholder="Search Order ID / Customer"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9 h-9 w-full sm:w-[220px]"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="processed">Processed</SelectItem>
                      <SelectItem value="settled">Settled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                    <SelectTrigger className="h-9 w-[140px]"><SelectValue placeholder="Payment" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Payments</SelectItem>
                      <SelectItem value="cod">COD</SelectItem>
                      <SelectItem value="prepaid">Prepaid</SelectItem>
                    </SelectContent>
                  </Select>
                  <input
                    ref={gstFileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                    className="hidden"
                    onChange={(e) => void onGstFile(e.target.files?.[0])}
                  />
                  <Button
                    variant="default"
                    size="sm"
                    className="h-9 gap-1.5"
                    disabled={uploadingGst}
                    onClick={() => gstFileRef.current?.click()}
                  >
                    {uploadingGst ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    Upload Excel
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportGst} disabled={filteredGst.length === 0}>
                    <Download className="h-4 w-4" /> Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {gstLoading ? (
                  <div className="flex items-center justify-center gap-2 p-12 text-text-muted">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading GST records…
                  </div>
                ) : gstError ? (
                  <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
                    <AlertCircle className="h-8 w-8 text-danger" />
                    <p className="text-sm text-text-secondary">Could not load GST data.</p>
                    <Button variant="outline" size="sm" onClick={() => void refetchGst()}>
                      Try again
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order ID</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">GST %</TableHead>
                          <TableHead className="text-right">GST Amount</TableHead>
                          <TableHead className="text-right">Taxable</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredGst.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={11} className="text-center text-sm text-text-muted py-8">
                              {gstRecords.length === 0
                                ? "No GST data yet. Upload an Excel file (Order ID, Consignee, TP INC/EXC GST, GST, Mode, Status) to populate this table."
                                : "No GST records match your filters."}
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredGst.map((r) => (
                            <TableRow key={r.orderId}>
                              <TableCell className="font-mono text-xs text-primary">{r.orderId}</TableCell>
                              <TableCell className="text-text-secondary">{formatDate(r.date)}</TableCell>
                              <TableCell>{r.customer}</TableCell>
                              <TableCell className="text-right">{fmtINR(r.amount)}</TableCell>
                              <TableCell className="text-right">{r.gstPct}%</TableCell>
                              <TableCell className="text-right">{fmtINR(r.gstAmount)}</TableCell>
                              <TableCell className="text-right">{fmtINR(r.taxableValue)}</TableCell>
                              <TableCell className="text-right font-medium">{fmtINR(r.total)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={cn(
                                  r.payment === "COD" ? "border-warning/40 text-warning-dark bg-warning-light/40" : "border-primary/40 text-primary bg-primary-light/40"
                                )}>{r.payment}</Badge>
                              </TableCell>
                              <TableCell><GstStatusBadge status={r.status} /></TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" title="View" onClick={() => toast.info(`${r.orderId}: ${fmtINR(r.total)} · GST ${r.gstPct}%`)}>
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Download row"
                                    onClick={() => {
                                      downloadCSV(`gst_${r.orderId}`, ["Order ID", "Date", "Customer", "Amount", "GST %", "GST Amount", "Taxable", "Total", "Payment", "Status"], [[
                                        r.orderId, r.date, r.customer, r.amount, r.gstPct, r.gstAmount, r.taxableValue, r.total, r.payment, r.status,
                                      ]]);
                                      toast.success(`Downloaded ${r.orderId}`);
                                    }}
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {showRemTab && (
          <TabsContent value="remittance" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {remLoading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
              ) : (
                <>
                  <div className="relative">
                    <KPICard icon={CheckCircle2} label="Total Settled" value={fmtINR(displayRemittanceSummary.totalSettled)} color="success" />
                    {showAdminEdit && (
                      <div className="absolute top-3 right-3">
                        <EditBtn
                          target={{
                            field: "totalSettled",
                            label: "Total Settled",
                            kind: "money",
                            autoValue: fmtINR(autoRemittanceSummary.totalSettled),
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <KPICard icon={Clock} label="Pending Settlement" value={fmtINR(displayRemittanceSummary.pending)} color="warning" />
                    {showAdminEdit && (
                      <div className="absolute top-3 right-3">
                        <EditBtn
                          target={{
                            field: "pendingSettlement",
                            label: "Pending Settlement",
                            kind: "money",
                            autoValue: fmtINR(autoRemittanceSummary.pending),
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <KPICard icon={Wallet} label="Last 7 Days" value={fmtINR(displayRemittanceSummary.thisWeek)} color="primary" />
                    {showAdminEdit && (
                      <div className="absolute top-3 right-3">
                        <EditBtn
                          target={{
                            field: "last7Days",
                            label: "Last 7 Days",
                            kind: "money",
                            autoValue: fmtINR(autoRemittanceSummary.thisWeek),
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <KPICard icon={TrendingUp} label="Last 30 Days" value={fmtINR(displayRemittanceSummary.thisMonth)} color="secondary" />
                    {showAdminEdit && (
                      <div className="absolute top-3 right-3">
                        <EditBtn
                          target={{
                            field: "last30Days",
                            label: "Last 30 Days",
                            kind: "money",
                            autoValue: fmtINR(autoRemittanceSummary.thisMonth),
                          }}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <Card className="border-border">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-base">Payout History</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={remStatusFilter} onValueChange={setRemStatusFilter}>
                    <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="settled">Settled</SelectItem>
                      <SelectItem value="on hold">On Hold</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportRemittances} disabled={filteredRemittances.length === 0}>
                    <Download className="h-4 w-4" /> Download Statement
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {remLoading ? (
                  <div className="flex items-center justify-center gap-2 p-12 text-text-muted">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Loading payout history…
                  </div>
                ) : remError ? (
                  <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
                    <AlertCircle className="h-8 w-8 text-danger" />
                    <p className="text-sm text-text-secondary">Could not load payout history.</p>
                    <Button variant="outline" size="sm" onClick={() => void refetchRem()}>
                      Try again
                    </Button>
                  </div>
                ) : filteredRemittances.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border m-4 p-8 text-center text-text-muted">
                    {remittances.length === 0
                      ? "No payouts yet. COD remittances appear after delivered COD orders are synced."
                      : "No payouts match your filters."}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Remittance ID</TableHead>
                          <TableHead>Settlement Date</TableHead>
                          <TableHead className="text-right">Orders</TableHead>
                          <TableHead className="text-right">COD Amount</TableHead>
                          <TableHead className="text-right">Deductions</TableHead>
                          <TableHead className="text-right">Net Payable</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>UTR / Reference</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRemittances.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-xs text-primary">{r.id}</TableCell>
                            <TableCell className="text-text-secondary">{formatDate(r.settleDate)}</TableCell>
                            <TableCell className="text-right">{r.ordersCount}</TableCell>
                            <TableCell className="text-right">{fmtINR(r.codAmount)}</TableCell>
                            <TableCell className="text-right text-danger">−{fmtINR(r.deductions)}</TableCell>
                            <TableCell className="text-right font-semibold">{fmtINR(r.netPayable)}</TableCell>
                            <TableCell><RemittanceStatusBadge status={r.status} /></TableCell>
                            <TableCell className="font-mono text-xs text-text-secondary">{r.utr || "—"}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="View details" onClick={() => toast.info(`Payout ${r.id}: ${r.status} — ${fmtINR(r.netPayable)}`)}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title="Download statement"
                                  onClick={() => {
                                    downloadCSV(`payout_${r.id}`, ["Remittance ID", "Settlement Date", "Orders", "COD Amount", "Deductions", "Net Payable", "Status", "UTR"], [[
                                      r.id, r.settleDate, r.ordersCount, r.codAmount, r.deductions, r.netPayable, r.status, r.utr ?? "",
                                    ]]);
                                    toast.success(`Downloaded ${r.id}`);
                                  }}
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editTarget?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-text-muted">
              Automatic value: <span className="font-medium text-text-secondary">{editTarget?.autoValue}</span>
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="payout-override-value">
                {editTarget?.kind === "money" ? "Amount (₹)" : "Value"}
              </Label>
              <Input
                id="payout-override-value"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder={editTarget?.kind === "money" ? "0.00" : "e.g. 13 Jul 2024"}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" disabled={savingEdit} onClick={() => void saveEdit(true)}>
              Use automatic
            </Button>
            <Button type="button" disabled={savingEdit} onClick={() => void saveEdit(false)}>
              {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GstStatusBadge({ status }: { status: GstRecord["status"] }) {
  const map = {
    Pending: "bg-warning-light/60 text-warning-dark border-warning/40",
    Processed: "bg-primary-light/60 text-primary-dark border-primary/40",
    Settled: "bg-success-light/60 text-success-dark border-success/40",
  } as const;
  return <Badge variant="outline" className={cn(map[status])}>{status}</Badge>;
}

function RemittanceStatusBadge({ status }: { status: CODRemittance["status"] }) {
  const map = {
    Pending: "bg-warning-light/60 text-warning-dark border-warning/40",
    Processing: "bg-primary-light/60 text-primary-dark border-primary/40",
    Settled: "bg-success-light/60 text-success-dark border-success/40",
    "On Hold": "bg-danger-light/60 text-danger-dark border-danger/40",
  } as const;
  return <Badge variant="outline" className={cn(map[status])}>{status}</Badge>;
}
