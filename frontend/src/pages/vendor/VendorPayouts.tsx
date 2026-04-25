import { useState, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  IndianRupee, CalendarClock, TrendingUp, Search, Download, Eye, FileText, CheckCircle2, Clock, Wallet
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ============= Types & Mock Data =============

interface GSTRecord {
  orderId: string;
  date: string;
  customer: string;
  amount: number;
  gstPct: number;
  gstAmount: number;
  taxableValue: number;
  total: number;
  payment: "COD" | "Prepaid";
  status: "Pending" | "Processed" | "Settled";
}

interface RemittanceRecord {
  remittanceId: string;
  settlementDate: string;
  fromDate: string;
  toDate: string;
  totalOrders: number;
  grossAmount: number;
  deductions: number;
  gst: number;
  netPayable: number;
  paymentStatus: "Pending" | "Initiated" | "Paid" | "Failed";
  reference: string;
}

const codStats = {
  nextCodOn: "23-Apr-2026",
  nextCodAmount: 41777,
  upcomingCod: 19129,
};

const gstRecords: GSTRecord[] = [
  { orderId: "ORD-10421", date: "18-Apr", customer: "Ravi Kumar", amount: 1499, gstPct: 18, gstAmount: 228.66, taxableValue: 1270.34, total: 1499, payment: "Prepaid", status: "Settled" },
  { orderId: "ORD-10422", date: "18-Apr", customer: "Priya Singh", amount: 2899, gstPct: 18, gstAmount: 442.22, taxableValue: 2456.78, total: 2899, payment: "COD", status: "Processed" },
  { orderId: "ORD-10423", date: "19-Apr", customer: "Amit Patel", amount: 799, gstPct: 12, gstAmount: 85.61, taxableValue: 713.39, total: 799, payment: "Prepaid", status: "Settled" },
  { orderId: "ORD-10424", date: "19-Apr", customer: "Sneha Iyer", amount: 3499, gstPct: 18, gstAmount: 533.74, taxableValue: 2965.26, total: 3499, payment: "COD", status: "Pending" },
  { orderId: "ORD-10425", date: "20-Apr", customer: "Vikram Rao", amount: 1199, gstPct: 18, gstAmount: 182.90, taxableValue: 1016.10, total: 1199, payment: "Prepaid", status: "Settled" },
  { orderId: "ORD-10426", date: "20-Apr", customer: "Neha Sharma", amount: 2299, gstPct: 18, gstAmount: 350.69, taxableValue: 1948.31, total: 2299, payment: "COD", status: "Processed" },
  { orderId: "ORD-10427", date: "21-Apr", customer: "Karan Mehta", amount: 999, gstPct: 5, gstAmount: 47.57, taxableValue: 951.43, total: 999, payment: "Prepaid", status: "Settled" },
  { orderId: "ORD-10428", date: "21-Apr", customer: "Anjali Verma", amount: 4299, gstPct: 18, gstAmount: 655.78, taxableValue: 3643.22, total: 4299, payment: "COD", status: "Pending" },
];

const remittances: RemittanceRecord[] = [
  { remittanceId: "REM-2026-0042", settlementDate: "22-Apr-2026", fromDate: "15-Apr", toDate: "21-Apr", totalOrders: 64, grossAmount: 84500, deductions: 4200, gst: 12890, netPayable: 67410, paymentStatus: "Paid", reference: "UTR8829471" },
  { remittanceId: "REM-2026-0041", settlementDate: "15-Apr-2026", fromDate: "08-Apr", toDate: "14-Apr", totalOrders: 51, grossAmount: 67200, deductions: 3360, gst: 10250, netPayable: 53590, paymentStatus: "Paid", reference: "UTR8821903" },
  { remittanceId: "REM-2026-0040", settlementDate: "08-Apr-2026", fromDate: "01-Apr", toDate: "07-Apr", totalOrders: 47, grossAmount: 59880, deductions: 2994, gst: 9135, netPayable: 47751, paymentStatus: "Paid", reference: "UTR8814522" },
  { remittanceId: "REM-2026-0043", settlementDate: "29-Apr-2026", fromDate: "22-Apr", toDate: "28-Apr", totalOrders: 38, grossAmount: 49210, deductions: 2461, gst: 7508, netPayable: 39241, paymentStatus: "Initiated", reference: "—" },
  { remittanceId: "REM-2026-0044", settlementDate: "06-May-2026", fromDate: "29-Apr", toDate: "05-May", totalOrders: 22, grossAmount: 28100, deductions: 1405, gst: 4287, netPayable: 22408, paymentStatus: "Pending", reference: "—" },
];

const fmtINR = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ============= Component =============

export default function VendorPayouts() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");

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
  }, [search, statusFilter, paymentFilter]);

  const remittanceSummary = useMemo(() => {
    const totalSettled = remittances.filter((r) => r.paymentStatus === "Paid").reduce((s, r) => s + r.netPayable, 0);
    const pending = remittances.filter((r) => r.paymentStatus !== "Paid").reduce((s, r) => s + r.netPayable, 0);
    const thisWeek = remittances.slice(0, 1).reduce((s, r) => s + r.netPayable, 0);
    const thisMonth = remittances.slice(0, 4).reduce((s, r) => s + r.netPayable, 0);
    return { totalSettled, pending, thisWeek, thisMonth };
  }, []);

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Payouts" breadcrumb={["Vendor", "Payouts"]} />

      {/* COD Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Next COD On</p>
                <p className="mt-2 text-2xl font-semibold text-text-primary">{codStats.nextCodOn}</p>
                <p className="mt-1 text-xs text-text-secondary">Scheduled settlement date</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light">
                <CalendarClock className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Next COD Amount</p>
                <p className="mt-2 text-2xl font-semibold text-text-primary">{fmtINR(codStats.nextCodAmount)}</p>
                <p className="mt-1 text-xs text-text-secondary">To be credited next cycle</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-light">
                <IndianRupee className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide">Upcoming COD</p>
                <p className="mt-2 text-2xl font-semibold text-text-primary">{fmtINR(codStats.upcomingCod)}</p>
                <p className="mt-1 text-xs text-text-secondary">Across future cycles</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning-light">
                <TrendingUp className="h-5 w-5 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="gst" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="gst">GST Data</TabsTrigger>
          <TabsTrigger value="remittance">Remittance</TabsTrigger>
        </TabsList>

        {/* GST Tab */}
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
                    className="pl-9 h-9 w-[220px]"
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
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5"
                  onClick={() => { toast.success("GST report download started"); }}
                >
                  <Download className="h-4 w-4" /> Export
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
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
                          No GST records match your filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredGst.map((r) => (
                        <TableRow key={r.orderId}>
                          <TableCell className="font-mono text-xs text-primary">{r.orderId}</TableCell>
                          <TableCell className="text-text-secondary">{r.date}</TableCell>
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
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="View" onClick={() => toast.info(`Viewing ${r.orderId}`)}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Download invoice" onClick={() => toast.success(`Invoice for ${r.orderId} downloaded`)}>
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
            </CardContent>
          </Card>
        </TabsContent>

        {/* Remittance Tab */}
        <TabsContent value="remittance" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard icon={CheckCircle2} label="Total Settled" value={fmtINR(remittanceSummary.totalSettled)} color="success" />
            <KPICard icon={Clock} label="Pending Settlement" value={fmtINR(remittanceSummary.pending)} color="warning" />
            <KPICard icon={Wallet} label="This Week" value={fmtINR(remittanceSummary.thisWeek)} color="primary" />
            <KPICard icon={TrendingUp} label="This Month" value={fmtINR(remittanceSummary.thisMonth)} color="secondary" />
          </div>

          <Card className="border-border">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Remittance History</CardTitle>
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => toast.success("Statement download started")}>
                <Download className="h-4 w-4" /> Download Statement
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Remittance ID</TableHead>
                      <TableHead>Settlement</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Deductions</TableHead>
                      <TableHead className="text-right">GST</TableHead>
                      <TableHead className="text-right">Net Payable</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {remittances.map((r) => (
                      <TableRow key={r.remittanceId}>
                        <TableCell className="font-mono text-xs text-primary">{r.remittanceId}</TableCell>
                        <TableCell className="text-text-secondary">{r.settlementDate}</TableCell>
                        <TableCell className="text-xs text-text-secondary">{r.fromDate} → {r.toDate}</TableCell>
                        <TableCell className="text-right">{r.totalOrders}</TableCell>
                        <TableCell className="text-right">{fmtINR(r.grossAmount)}</TableCell>
                        <TableCell className="text-right text-danger">−{fmtINR(r.deductions)}</TableCell>
                        <TableCell className="text-right">{fmtINR(r.gst)}</TableCell>
                        <TableCell className="text-right font-semibold">{fmtINR(r.netPayable)}</TableCell>
                        <TableCell><RemittanceStatusBadge status={r.paymentStatus} /></TableCell>
                        <TableCell className="font-mono text-xs text-text-secondary">{r.reference}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="View details" onClick={() => toast.info(`Viewing ${r.remittanceId}`)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Download statement" onClick={() => toast.success(`Statement for ${r.remittanceId} downloaded`)}>
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GstStatusBadge({ status }: { status: GSTRecord["status"] }) {
  const map = {
    Pending: "bg-warning-light/60 text-warning-dark border-warning/40",
    Processed: "bg-primary-light/60 text-primary-dark border-primary/40",
    Settled: "bg-success-light/60 text-success-dark border-success/40",
  } as const;
  return <Badge variant="outline" className={cn(map[status])}>{status}</Badge>;
}

function RemittanceStatusBadge({ status }: { status: RemittanceRecord["paymentStatus"] }) {
  const map = {
    Pending: "bg-warning-light/60 text-warning-dark border-warning/40",
    Initiated: "bg-primary-light/60 text-primary-dark border-primary/40",
    Paid: "bg-success-light/60 text-success-dark border-success/40",
    Failed: "bg-danger-light/60 text-danger-dark border-danger/40",
  } as const;
  return <Badge variant="outline" className={cn(map[status])}>{status}</Badge>;
}
