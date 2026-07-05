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
import { Loader2, RefreshCw, Shield } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";
import * as securityService from "@/services/securityService";
import type { LoginActivityRow } from "@/services/securityService";

export default function AdminLoginActivity() {
  const [items, setItems] = useState<LoginActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [userFilter, setUserFilter] = useState("");
  const [emailFilter, setEmailFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("loginTime");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await securityService.adminListLoginActivity({
        page: String(page),
        limit: String(limit),
        user: userFilter || undefined,
        email: emailFilter || undefined,
        role: roleFilter !== "all" ? roleFilter : undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        sortBy,
        sortDir,
      });
      setItems(r.items ?? []);
      setTotal(r.total ?? 0);
    } catch (e) {
      setItems([]);
      setTotal(0);
      toast.error(e instanceof ApiError ? e.message : "Failed to load login activity");
    } finally {
      setLoading(false);
    }
  }, [page, limit, userFilter, emailFilter, roleFilter, dateFrom, dateTo, sortBy, sortDir]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const toggleSort = (field: string) => {
    if (sortBy === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(1);
  };

  return (
    <div className="animate-fade-in-up space-y-4">
      <PageHeader title="Login Activity" breadcrumb={["Admin", "Security", "Login Activity"]} />

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card lg:flex-row lg:flex-wrap">
        <Input placeholder="Search user name" value={userFilter} onChange={(e) => { setUserFilter(e.target.value); setPage(1); }} className="lg:w-44" />
        <Input placeholder="Email" value={emailFilter} onChange={(e) => { setEmailFilter(e.target.value); setPage(1); }} className="lg:w-52" />
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(1); }}>
          <SelectTrigger className="lg:w-40"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="vendor">Vendor</SelectItem>
            <SelectItem value="dropshipper">Dropshipper</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="lg:w-40" />
        <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="lg:w-40" />
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {loading && !items.length ? (
        <div className="animate-pulse p-8 text-text-muted">Loading sessions…</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Shield} title="No login sessions" description="Login events will appear here when users sign in." />
      ) : (
        <div className="rounded-lg bg-card shadow-card overflow-x-auto border border-border">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="p-3 text-left font-medium">User</th>
                <th className="p-3 text-left font-medium">Role</th>
                <th className="p-3 text-left font-medium cursor-pointer" onClick={() => toggleSort("loginTime")}>Login</th>
                <th className="p-3 text-left font-medium">Logout</th>
                <th className="p-3 text-left font-medium cursor-pointer" onClick={() => toggleSort("lastActiveTime")}>Last active</th>
                <th className="p-3 text-left font-medium">Duration</th>
                <th className="p-3 text-left font-medium cursor-pointer" onClick={() => toggleSort("browser")}>Browser</th>
                <th className="p-3 text-left font-medium">OS / Device</th>
                <th className="p-3 text-left font-medium">IP</th>
                <th className="p-3 text-left font-medium">Location</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                  <td className="p-3">
                    <p className="font-medium text-text-primary">{row.userName}</p>
                    <p className="text-xs text-text-muted">{row.email}</p>
                  </td>
                  <td className="p-3 capitalize">{row.role}</td>
                  <td className="p-3 text-xs whitespace-nowrap">{new Date(row.loginTime).toLocaleString("en-IN")}</td>
                  <td className="p-3 text-xs whitespace-nowrap">
                    {row.logoutTime ? new Date(row.logoutTime).toLocaleString("en-IN") : row.isActive ? "Active" : "—"}
                  </td>
                  <td className="p-3 text-xs whitespace-nowrap">{new Date(row.lastActiveTime).toLocaleString("en-IN")}</td>
                  <td className="p-3 text-xs">{row.sessionDuration}</td>
                  <td className="p-3 text-xs">{row.browser}</td>
                  <td className="p-3 text-xs">{row.operatingSystem} · {row.deviceType}</td>
                  <td className="p-3 text-xs font-mono">{row.ipAddress || "—"}</td>
                  <td className="p-3 text-xs">{row.location || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Page {page} of {totalPages} · {total} sessions</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
