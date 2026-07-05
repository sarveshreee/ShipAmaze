import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import * as securityService from "@/services/securityService";
import type { ActivityLogRow } from "@/services/securityService";

export default function AdminActivityLogs() {
  const [items, setItems] = useState<ActivityLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState("24h");
  const [userFilter, setUserFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [modules, setModules] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    void securityService.adminListActivityModules().then((r) => setModules(r.modules ?? [])).catch(() => setModules([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await securityService.adminListActivityLogs({
        page: String(page),
        limit: String(limit),
        preset: preset !== "custom" ? preset : undefined,
        from: preset === "custom" ? dateFrom || undefined : undefined,
        to: preset === "custom" ? dateTo || undefined : undefined,
        user: userFilter || undefined,
        module: moduleFilter !== "all" ? moduleFilter : undefined,
      });
      setItems(r.items ?? []);
      setTotal(r.total ?? 0);
    } catch (e) {
      setItems([]);
      setTotal(0);
      toast.error(e instanceof ApiError ? e.message : "Failed to load activity logs");
    } finally {
      setLoading(false);
    }
  }, [page, limit, preset, userFilter, moduleFilter, dateFrom, dateTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="animate-fade-in-up space-y-4">
      <PageHeader title="Activity Logs" breadcrumb={["Admin", "Activity Logs"]} />

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card lg:flex-row lg:flex-wrap">
        <Select value={preset} onValueChange={(v) => { setPreset(v); setPage(1); }}>
          <SelectTrigger className="lg:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="24h">Last 24 hours</SelectItem>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="custom">Custom range</SelectItem>
          </SelectContent>
        </Select>
        {preset === "custom" && (
          <>
            <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="lg:w-40" />
            <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="lg:w-40" />
          </>
        )}
        <Input placeholder="User name or ID" value={userFilter} onChange={(e) => { setUserFilter(e.target.value); setPage(1); }} className="lg:w-48" />
        <Select value={moduleFilter} onValueChange={(v) => { setModuleFilter(v); setPage(1); }}>
          <SelectTrigger className="lg:w-44"><SelectValue placeholder="Module" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {modules.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {loading && !items.length ? (
        <div className="animate-pulse p-8 text-text-muted">Loading activity…</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Activity} title="No activity" description="User actions will be recorded here." />
      ) : (
        <div className="rounded-lg bg-card shadow-card overflow-x-auto border border-border">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="p-3 text-left font-medium">Timestamp</th>
                <th className="p-3 text-left font-medium">User</th>
                <th className="p-3 text-left font-medium">Role</th>
                <th className="p-3 text-left font-medium">Module</th>
                <th className="p-3 text-left font-medium">Action</th>
                <th className="p-3 text-left font-medium">Browser</th>
                <th className="p-3 text-left font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                  <td className="p-3 text-xs whitespace-nowrap">{new Date(row.timestamp).toLocaleString("en-IN")}</td>
                  <td className="p-3">
                    <p className="font-medium text-text-primary">{row.userName}</p>
                  </td>
                  <td className="p-3 capitalize text-xs">{row.role}</td>
                  <td className="p-3 capitalize text-xs">{row.module}</td>
                  <td className="p-3 text-xs">{row.action}</td>
                  <td className="p-3 text-xs">{row.browser || "—"}</td>
                  <td className="p-3 text-xs font-mono">{row.ipAddress || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Page {page} of {totalPages} · {total} events</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
