import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import * as adminWorkflowService from "@/services/adminWorkflowService";
import type { AdminDropshipperRow } from "@/services/adminWorkflowService";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { Search, Users, Loader2, RefreshCw } from "lucide-react";
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
import { toast } from "sonner";
import { ApiError } from "@/lib/apiClient";

export default function AdminDropshippers() {
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [items, setItems] = useState<AdminDropshipperRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<string>("all");
  const [blocked, setBlocked] = useState<string>("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminWorkflowService.adminListDropshippers({
        page: String(page),
        limit: String(limit),
        search: searchDebounced || undefined,
        accountStatus: accountStatus !== "all" ? accountStatus : undefined,
        blocked: blocked !== "all" ? blocked : undefined,
      });
      setItems(r.items ?? []);
      setTotal(r.total ?? 0);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(e instanceof ApiError ? e.message : "Failed to load dropshippers");
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchDebounced, accountStatus, blocked]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    void (async () => {
      setDetailLoading(true);
      try {
        const d = await adminWorkflowService.adminGetDropshipper(detailId);
        setDetail(d);
      } catch {
        setDetail(null);
        toast.error("Could not load dropshipper");
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [detailId]);

  const patchAccount = async (userStatus: string) => {
    if (!detailId) return;
    setSaving(true);
    try {
      await adminWorkflowService.adminPatchDropshipper(detailId, { userStatus });
      toast.success("Updated");
      await load();
      setDetail(await adminWorkflowService.adminGetDropshipper(detailId));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const user = detail?.user as Record<string, unknown> | undefined;
  const shopify = detail?.shopify as Record<string, unknown> | undefined;

  return (
    <div className="animate-fade-in-up space-y-4">
      <PageHeader title="Dropshipper management" breadcrumb={["Admin", "Dropshippers"]} />

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap rounded-lg border border-border bg-card p-4 shadow-card">
        <div className="relative flex-1 max-w-md min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input
            placeholder="Search name, email, phone…"
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select
          value={accountStatus}
          onValueChange={(v) => {
            setAccountStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Account" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={blocked}
          onValueChange={(v) => {
            setBlocked(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Blocked" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any</SelectItem>
            <SelectItem value="true">Blocked</SelectItem>
            <SelectItem value="false">Not blocked</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-light/30 px-4 py-3 text-sm flex justify-between gap-3">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {loading && !items.length ? (
        <div className="animate-pulse p-8 text-text-muted">Loading dropshippers…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No dropshippers found"
          description={search ? "Try adjusting your search" : "No dropshipper accounts yet"}
          actionLabel="Clear search"
          onAction={() => setSearch("")}
        />
      ) : (
        <div className="rounded-lg bg-card shadow-card overflow-x-auto border border-border">
          <table className="w-full text-sm min-w-[880px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="p-3 text-left font-medium text-text-secondary">Name</th>
                <th className="p-3 text-left font-medium text-text-secondary">Email</th>
                <th className="p-3 text-left font-medium text-text-secondary">Wallet</th>
                <th className="p-3 text-left font-medium text-text-secondary">Orders / Ship</th>
                <th className="p-3 text-left font-medium text-text-secondary">Shopify</th>
                <th className="p-3 text-left font-medium text-text-secondary">Account</th>
                <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                  <td className="p-3 font-medium text-text-primary">{d.name}</td>
                  <td className="p-3 text-text-secondary text-xs">{d.email}</td>
                  <td className="p-3 tabular-nums font-medium">₹{(d.walletBalance ?? 0).toLocaleString("en-IN")}</td>
                  <td className="p-3 tabular-nums text-text-secondary">
                    {d.orderCount} / {d.shipmentCount}
                  </td>
                  <td className="p-3 text-xs">
                    {d.shopify?.connected ? (
                      <span className="text-success-dark">{d.shopify.shopDomain}</span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        d.accountStatus === "active"
                          ? "bg-success-light text-success-dark"
                          : d.accountStatus === "blocked"
                            ? "bg-danger-light text-danger-dark"
                            : "bg-surface-2 text-text-muted"
                      )}
                    >
                      {d.accountStatus}
                    </span>
                  </td>
                  <td className="p-3">
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setDetailId(d.id)}>
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">
            Page {page} of {totalPages}
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
      )}

      <Sheet open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-left pr-8">Dropshipper</SheetTitle>
          </SheetHeader>
          {detailLoading && <p className="text-sm text-text-muted mt-4">Loading…</p>}
          {!detailLoading && detail && (
            <div className="mt-4 space-y-3 text-sm">
              <p className="font-semibold">{String(user?.name ?? "")}</p>
              <p className="text-text-secondary">{String(user?.email ?? "")}</p>
              <p>
                KYC: {detail.kycVerified ? "Verified" : "Not verified"} · Model totals: {String(detail.totalOrders ?? 0)}{" "}
                orders
              </p>
              <p>
                Live order count: {String(detail.orderCount ?? 0)} · Shipments: {String(detail.shipmentCount ?? 0)}
              </p>
              <p>
                Wallet: ₹{Number(detail.walletBalance ?? 0).toLocaleString("en-IN")}
              </p>
              <div className="rounded-md border border-border p-3 bg-surface-2/30">
                <p className="font-medium mb-1">Shopify</p>
                {shopify?.connected ? (
                  <p className="text-xs text-text-secondary">
                    {String(shopify.shopDomain ?? "")}
                    <br />
                    Last sync:{" "}
                    {shopify.lastSyncedAt
                      ? new Date(String(shopify.lastSyncedAt)).toLocaleString("en-IN")
                      : "—"}
                  </p>
                ) : (
                  <p className="text-xs text-text-muted">Not connected</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
                <Button size="sm" disabled={saving} onClick={() => void patchAccount("active")}>
                  Activate
                </Button>
                <Button size="sm" variant="outline" disabled={saving} onClick={() => void patchAccount("inactive")}>
                  Deactivate
                </Button>
                <Button size="sm" variant="destructive" disabled={saving} onClick={() => void patchAccount("blocked")}>
                  Block
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
