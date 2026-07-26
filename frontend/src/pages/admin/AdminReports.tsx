import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KPICard } from "@/components/KPICard";
import {
  Download,
  FileText,
  BarChart3,
  TrendingUp,
  Package,
  IndianRupee,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { downloadPDF } from "@/lib/exportUtils";
import { toast } from "sonner";
import * as reportsService from "@/services/reportsService";
import type { ReportsSummary, ReportOrderRow } from "@/services/reportsService";
import * as adminWorkflowService from "@/services/adminWorkflowService";
import { ApiError } from "@/lib/apiClient";

type TabKey = "overview" | "courier" | "zone" | "orders";

function formatLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function presetToDates(preset: string): { dateFrom?: string; dateTo?: string } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  if (preset === "7d") start.setDate(start.getDate() - 6);
  else if (preset === "30d") start.setDate(start.getDate() - 29);
  else if (preset === "90d") start.setDate(start.getDate() - 89);
  else if (preset === "ytd") {
    start.setMonth(0, 1);
  } else return {};
  return {
    dateFrom: formatLocalYmd(start),
    dateTo: formatLocalYmd(end),
  };
}

function buildFilterParams(opts: {
  datePreset: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  payment: string;
  courier: string;
  source: string;
  scopeUserId: string;
  page: number;
  pageSize: number;
}): Record<string, string | undefined> {
  const p: Record<string, string | undefined> = {
    page: String(opts.page),
    pageSize: String(opts.pageSize),
  };
  if (opts.scopeUserId) p.scopeUserId = opts.scopeUserId;
  if (opts.status && opts.status !== "all") p.status = opts.status;
  if (opts.payment && opts.payment !== "all") {
    p.payment = opts.payment === "cod" ? "cod" : opts.payment === "prepaid" ? "prepaid" : opts.payment;
  }
  if (opts.courier.trim()) p.courier = opts.courier.trim();
  if (opts.source && opts.source !== "all") p.source = opts.source;

  if (opts.datePreset === "custom") {
    if (opts.dateFrom) p.dateFrom = opts.dateFrom;
    if (opts.dateTo) p.dateTo = opts.dateTo;
  } else if (opts.datePreset !== "all") {
    const d = presetToDates(opts.datePreset);
    if (d.dateFrom) p.dateFrom = d.dateFrom;
    if (d.dateTo) p.dateTo = d.dateTo;
  }
  return p;
}

export default function AdminReports() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [datePreset, setDatePreset] = useState("30d");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const [courier, setCourier] = useState("");
  const [source, setSource] = useState("all");
  const [scopeUserId, setScopeUserId] = useState("");
  const [scopeOptions, setScopeOptions] = useState<{ id: string; label: string }[]>([]);

  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [orders, setOrders] = useState<ReportOrderRow[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [loading, setLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filterBase = useMemo(
    () => ({
      datePreset,
      dateFrom,
      dateTo,
      status,
      payment,
      courier,
      source,
      scopeUserId,
      page,
      pageSize,
    }),
    [datePreset, dateFrom, dateTo, status, payment, courier, source, scopeUserId, page, pageSize]
  );

  const filterParams = useMemo(() => buildFilterParams(filterBase), [filterBase]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { page: _p, pageSize: _ps, ...rest } = filterParams;
      const s = await reportsService.fetchReportsSummary(rest);
      setSummary(s);
    } catch (e) {
      setSummary(null);
      setError(e instanceof ApiError ? e.message : "Failed to load report summary");
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const r = await reportsService.fetchReportsOrders(filterParams);
      setOrders(r.orders);
      setTotalOrders(r.total);
    } catch {
      setOrders([]);
      setTotalOrders(0);
    } finally {
      setOrdersLoading(false);
    }
  }, [filterParams]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    void (async () => {
      try {
        const [v, d] = await Promise.all([
          adminWorkflowService.adminListVendors({ limit: "150" }),
          adminWorkflowService.adminListDropshippers({ limit: "150" }),
        ]);
        const opts: { id: string; label: string }[] = [{ id: "", label: "All accounts (platform)" }];
        for (const x of v.items ?? []) {
          opts.push({ id: x.userId, label: `Vendor: ${x.companyName || x.name}` });
        }
        for (const x of d.items ?? []) {
          opts.push({ id: x.userId, label: `Dropshipper: ${x.name || x.email}` });
        }
        setScopeOptions(opts);
      } catch {
        setScopeOptions([{ id: "", label: "All accounts (platform)" }]);
      }
    })();
  }, []);

  const clearFilters = () => {
    setDatePreset("30d");
    setDateFrom("");
    setDateTo("");
    setStatus("all");
    setPayment("all");
    setCourier("");
    setSource("all");
    setScopeUserId("");
    setPage(1);
  };

  const chips = useMemo(() => {
    const c: { key: string; label: string }[] = [];
    if (scopeUserId) {
      const l = scopeOptions.find((o) => o.id === scopeUserId)?.label ?? scopeUserId;
      c.push({ key: "scope", label: `Account: ${l}` });
    }
    if (datePreset === "custom" && (dateFrom || dateTo)) {
      c.push({ key: "dates", label: `Dates: ${dateFrom || "…"} → ${dateTo || "…"}` });
    } else if (datePreset !== "all") {
      c.push({ key: "preset", label: `Period: ${datePreset}` });
    }
    if (status !== "all") c.push({ key: "status", label: `Status: ${status}` });
    if (payment !== "all") c.push({ key: "pay", label: `Payment: ${payment}` });
    if (courier.trim()) c.push({ key: "courier", label: `Courier: ${courier}` });
    if (source !== "all") c.push({ key: "src", label: `Source: ${source}` });
    return c;
  }, [scopeUserId, scopeOptions, datePreset, dateFrom, dateTo, status, payment, courier, source]);

  const statusDistribution = useMemo(() => {
    if (!summary?.byStatus.length) {
      return [{ name: "No data", value: 1, color: "hsl(var(--color-text-muted))" }];
    }
    const colors: Record<string, string> = {
      delivered: "hsl(var(--color-success))",
      "in-transit": "hsl(var(--color-primary))",
      "out-for-delivery": "hsl(var(--color-secondary))",
      rto: "hsl(var(--color-danger))",
      ndr: "hsl(var(--color-warning))",
      pending: "hsl(var(--color-text-muted))",
    };
    return summary.byStatus.map((s) => ({
      name: String(s.status || "—").replace(/-/g, " "),
      value: s.count,
      color: colors[String(s.status)] || "hsl(var(--color-text-muted))",
    }));
  }, [summary]);

  const courierWise = summary?.byCourier ?? [];
  const zoneWise = summary?.byZone ?? [];

  const handleExportCsv = async () => {
    try {
      const { page: _p, pageSize: _ps, ...rest } = filterParams;
      if (tab === "orders") {
        await reportsService.downloadReportCsv("orders", rest);
      } else if (tab === "courier") {
        await reportsService.downloadReportCsv("orders", rest);
      } else if (tab === "zone") {
        await reportsService.downloadReportCsv("orders", rest);
      } else {
        await reportsService.downloadReportCsv("orders", rest);
      }
      toast.success("CSV download started");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Export failed");
    }
  };

  const handleExportShipmentsCsv = async () => {
    try {
      const { page: _p, pageSize: _ps, ...rest } = filterParams;
      await reportsService.downloadReportCsv("shipments", rest);
      toast.success("Shipments CSV download started");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Export failed");
    }
  };

  const handleExportPDF = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    if (tab === "courier" && courierWise.length) {
      downloadPDF(
        `courier_report_${stamp}`,
        "Courier Performance Report",
        ["Courier", "Orders", "Revenue"],
        courierWise.map((c) => [c.courier, c.count, `₹${c.revenue.toLocaleString("en-IN")}`]),
        [`Generated: ${stamp}`, `Filters applied (see CSV for full export)`]
      );
    } else if (tab === "zone" && zoneWise.length) {
      downloadPDF(
        `zone_report_${stamp}`,
        "Zone Performance Report",
        ["Zone", "Orders", "Delivery %"],
        zoneWise.map((z) => [z.zone, z.orders, `${z.deliveryRatePct}%`]),
        [`Generated: ${stamp}`]
      );
    } else if (tab === "orders" && orders.length) {
      downloadPDF(
        `orders_report_${stamp}`,
        "Orders Report (current page)",
        ["Order ID", "Customer", "City", "Courier", "Status", "Amount", "Date"],
        orders.map((o) => [o.id, o.customer, o.city, o.courier, o.status, `₹${o.amount}`, o.date]),
        [`Page ${page} of ${Math.ceil(totalOrders / pageSize) || 1}`, `Export CSV for full filtered dataset`]
      );
    } else if (summary) {
      downloadPDF(
        `summary_report_${stamp}`,
        "Reports Summary",
        ["Metric", "Value"],
        [
          ["Total orders", summary.orderCount],
          ["Total amount", `₹${summary.totalAmount.toLocaleString("en-IN")}`],
          ["Shipments", summary.shipmentCount],
          ["Delivered", summary.deliveredCount],
          ["Delivery rate", `${summary.deliveryRatePct}%`],
        ],
        [`Generated: ${stamp}`]
      );
    } else {
      toast.message("Load report data first");
    }
    toast.success("PDF print dialog opened");
  };

  const totalPages = Math.max(1, Math.ceil(totalOrders / pageSize));

  return (
    <div className="animate-fade-in-up space-y-4">
      <PageHeader title="Reports" breadcrumb={["Admin", "Reports"]} />

      <div className="rounded-lg border border-border bg-card p-4 shadow-card space-y-3">
        <div className="flex flex-col xl:flex-row gap-3 flex-wrap items-end">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2 flex-1 w-full">
            <div>
              <label className="text-xs text-text-muted mb-1 block">Account scope</label>
              <Select value={scopeUserId || "all"} onValueChange={(v) => { setScopeUserId(v === "all" ? "" : v); setPage(1); }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All platform</SelectItem>
                  {scopeOptions.filter((o) => o.id).map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Date range</label>
              <Select
                value={datePreset}
                onValueChange={(v) => {
                  setDatePreset(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="90d">Last 90 days</SelectItem>
                  <SelectItem value="ytd">Year to date</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {datePreset === "custom" && (
              <>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">From</label>
                  <Input type="date" className="h-9" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
                </div>
                <div>
                  <label className="text-xs text-text-muted mb-1 block">To</label>
                  <Input type="date" className="h-9" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
                </div>
              </>
            )}
            <div>
              <label className="text-xs text-text-muted mb-1 block">Order status</label>
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                  <SelectItem value="in-transit">In transit</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="rto">RTO</SelectItem>
                  <SelectItem value="ndr">NDR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Payment</label>
              <Select value={payment} onValueChange={(v) => { setPayment(v); setPage(1); }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="cod">COD</SelectItem>
                  <SelectItem value="prepaid">Prepaid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-text-muted mb-1 block">Source</label>
              <Select value={source} onValueChange={(v) => { setSource(v); setPage(1); }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="shopify">Shopify / channel</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="text-xs text-text-muted mb-1 block">Courier contains</label>
              <Input
                className="h-9"
                placeholder="e.g. Delhivery"
                value={courier}
                onChange={(e) => {
                  setCourier(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { void loadSummary(); void loadOrders(); }}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-text-muted">Active:</span>
            {chips.map((ch) => (
              <span
                key={ch.key}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2/50 px-2 py-0.5 text-xs text-text-secondary"
              >
                {ch.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-light/20 px-4 py-3 text-sm flex justify-between gap-3 items-center">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void loadSummary()}>
            Retry
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 border-b border-border">
          {(["overview", "courier", "zone", "orders"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-[1px] transition-colors",
                tab === t ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text-primary"
              )}
            >
              {t === "courier" ? "Courier" : t === "zone" ? "Zone" : t === "orders" ? "Orders" : "Overview"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void handleExportShipmentsCsv()}>
            <Download className="h-4 w-4 mr-1" />
            Shipments CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleExportCsv()}>
            <Download className="h-4 w-4 mr-1" />
            Orders CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <FileText className="h-4 w-4 mr-1" />
            Print / PDF
          </Button>
        </div>
      </div>

      {loading && !summary ? (
        <div className="flex items-center gap-2 p-8 text-text-muted">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading reports…
        </div>
      ) : !summary ? (
        <div className="rounded-lg border border-border p-8 text-center text-text-muted">No summary data</div>
      ) : (
        <>
          {tab === "overview" && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard icon={Package} label="Orders" value={String(summary.orderCount)} color="primary" />
                <KPICard
                  icon={TrendingUp}
                  label="Delivery rate"
                  value={`${summary.deliveryRatePct}%`}
                  color="success"
                />
                <KPICard
                  icon={IndianRupee}
                  label="Order value (sum)"
                  value={`₹${summary.totalAmount.toLocaleString("en-IN")}`}
                  color="tertiary"
                />
                <KPICard icon={BarChart3} label="Shipments" value={String(summary.shipmentCount)} color="secondary" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 rounded-lg bg-card shadow-card p-5 border border-border">
                  <h3 className="font-semibold text-text-primary mb-4">Revenue by courier (filtered)</h3>
                  <div className="w-full min-h-[280px] min-w-0">
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={(courierWise.length ? courierWise : [{ courier: "—", revenue: 0, count: 0 }]).slice(0, 12)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" />
                        <XAxis dataKey="courier" tick={{ fontSize: 10 }} stroke="hsl(var(--color-text-muted))" />
                        <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--color-text-muted))" />
                        <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-IN")}`} />
                        <Legend />
                        <Bar dataKey="revenue" name="Revenue (₹)" fill="hsl(var(--color-primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-lg bg-card shadow-card p-5 border border-border">
                  <h3 className="font-semibold text-text-primary mb-4">Status mix</h3>
                  <div className="w-full min-h-[220px] min-w-0">
                    <ResponsiveContainer width="100%" height={220}>
                      <PieChart>
                        <Pie
                          data={statusDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {statusDistribution.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => v.toLocaleString()} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "courier" && (
            <>
              <div className="rounded-lg bg-card shadow-card p-5 border border-border mb-4">
                <h3 className="font-semibold text-text-primary mb-4">By courier</h3>
                <div className="w-full min-h-[260px] min-w-0">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={courierWise.length ? courierWise : [{ courier: "—", count: 0, revenue: 0 }]}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--color-border))" />
                      <XAxis dataKey="courier" tick={{ fontSize: 11 }} stroke="hsl(var(--color-text-muted))" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--color-text-muted))" />
                      <Tooltip />
                      <Bar dataKey="count" name="Orders" fill="hsl(var(--color-primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-lg bg-card shadow-card overflow-x-auto border border-border">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b border-border bg-surface-2/50">
                      <th className="p-3 text-left">Courier</th>
                      <th className="p-3 text-right">Orders</th>
                      <th className="p-3 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courierWise.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-8 text-center text-text-muted">
                          No data for filters
                        </td>
                      </tr>
                    ) : (
                      courierWise.map((c) => (
                        <tr key={c.courier} className="border-b border-border last:border-0">
                          <td className="p-3 font-medium">{c.courier}</td>
                          <td className="p-3 text-right">{c.count}</td>
                          <td className="p-3 text-right">₹{c.revenue.toLocaleString("en-IN")}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "zone" && (
            <div className="rounded-lg bg-card shadow-card overflow-x-auto border border-border">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="border-b border-border bg-surface-2/50">
                    <th className="p-3 text-left">Zone</th>
                    <th className="p-3 text-right">Orders</th>
                    <th className="p-3 text-right">Delivered</th>
                    <th className="p-3 text-right">Delivery %</th>
                  </tr>
                </thead>
                <tbody>
                  {zoneWise.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-text-muted">
                        No zone data
                      </td>
                    </tr>
                  ) : (
                    zoneWise.map((z) => (
                      <tr key={z.zone} className="border-b border-border last:border-0">
                        <td className="p-3 font-medium">{z.zone}</td>
                        <td className="p-3 text-right">{z.orders}</td>
                        <td className="p-3 text-right">{z.delivered}</td>
                        <td className="p-3 text-right">{z.deliveryRatePct}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "orders" && (
            <div className="space-y-3">
              {ordersLoading ? (
                <div className="flex items-center gap-2 text-text-muted p-4">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading orders…
                </div>
              ) : orders.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-text-muted">
                  No orders match filters
                </div>
              ) : (
                <div className="rounded-lg bg-card shadow-card overflow-x-auto border border-border">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="border-b border-border bg-surface-2/50">
                        <th className="p-3 text-left">Order</th>
                        <th className="p-3 text-left">Customer</th>
                        <th className="p-3 text-left">City</th>
                        <th className="p-3 text-left">Courier</th>
                        <th className="p-3 text-left">Pay</th>
                        <th className="p-3 text-left">Status</th>
                        <th className="p-3 text-right">Amt</th>
                        <th className="p-3 text-left">Date</th>
                        <th className="p-3 text-left">Ship</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((o) => (
                        <tr key={o.id} className="border-b border-border last:border-0">
                          <td className="p-3 font-mono text-xs text-primary">{o.id}</td>
                          <td className="p-3">{o.customer}</td>
                          <td className="p-3 text-text-secondary">{o.city}</td>
                          <td className="p-3 text-text-secondary">{o.courier}</td>
                          <td className="p-3">{o.payment}</td>
                          <td className="p-3 capitalize">{o.status}</td>
                          <td className="p-3 text-right">₹{o.amount.toLocaleString("en-IN")}</td>
                          <td className="p-3 text-text-muted text-xs">{o.date}</td>
                          <td className="p-3 text-xs">{o.shipmentCreated ? "Yes" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-muted">
                  Page {page} / {totalPages} · {totalOrders} orders
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
