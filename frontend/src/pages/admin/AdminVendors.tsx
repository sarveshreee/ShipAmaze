import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import * as adminWorkflowService from "@/services/adminWorkflowService";
import type { AdminVendorRow } from "@/services/adminWorkflowService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Warehouse, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";
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

export default function AdminVendors() {
  const [items, setItems] = useState<AdminVendorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [accountStatus, setAccountStatus] = useState<string>("all");
  const [vendorStatus, setVendorStatus] = useState<string>("all");
  const [blocked, setBlocked] = useState<string>("all");
  const [onboardingStatus, setOnboardingStatus] = useState<string>("all");
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
      const r = await adminWorkflowService.adminListVendors({
        page: String(page),
        limit: String(limit),
        search: searchDebounced || undefined,
        accountStatus: accountStatus !== "all" ? accountStatus : undefined,
        vendorStatus: vendorStatus !== "all" ? vendorStatus : undefined,
        blocked: blocked !== "all" ? blocked : undefined,
        onboardingStatus: onboardingStatus !== "all" ? onboardingStatus : undefined,
      });
      setItems(r.items ?? []);
      setTotal(r.total ?? 0);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(e instanceof ApiError ? e.message : "Failed to load vendors");
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchDebounced, accountStatus, vendorStatus, blocked, onboardingStatus]);

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
        const d = await adminWorkflowService.adminGetVendor(detailId);
        setDetail(d);
      } catch {
        setDetail(null);
        toast.error("Could not load vendor");
      } finally {
        setDetailLoading(false);
      }
    })();
  }, [detailId]);

  const patchVendor = async (body: { vendorStatus?: string; userStatus?: string }) => {
    if (!detailId) return;
    setSaving(true);
    try {
      await adminWorkflowService.adminPatchVendor(detailId, body);
      toast.success("Vendor updated");
      await load();
      const d = await adminWorkflowService.adminGetVendor(detailId);
      setDetail(d);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const shopify = detail?.shopify as Record<string, unknown> | undefined;
  const user = detail?.user as Record<string, unknown> | undefined;

  return (
    <div className="animate-fade-in-up space-y-4">
      <PageHeader title="Vendor management" breadcrumb={["Admin", "Vendors"]} />

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card">
        <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
          <Input
            placeholder="Search company, name, email, phone…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="max-w-md"
          />
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
              <SelectItem value="all">All accounts</SelectItem>
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
              <SelectItem value="all">Blocked any</SelectItem>
              <SelectItem value="true">Blocked only</SelectItem>
              <SelectItem value="false">Not blocked</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={vendorStatus}
            onValueChange={(v) => {
              setVendorStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Vendor status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Vendor any</SelectItem>
              <SelectItem value="Active">Warehouse active</SelectItem>
              <SelectItem value="Inactive">Warehouse inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={onboardingStatus}
            onValueChange={(v) => {
              setOnboardingStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Onboarding" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All onboarding</SelectItem>
              <SelectItem value="complete">Active login</SelectItem>
              <SelectItem value="pending">Inactive login</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
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
        <div className="animate-pulse p-8 text-text-muted">Loading vendors…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Warehouse}
          title="No vendors found"
          description="Try changing filters or search."
          actionLabel="Clear filters"
          onAction={() => {
            setSearch("");
            setAccountStatus("all");
            setVendorStatus("all");
            setBlocked("all");
            setOnboardingStatus("all");
          }}
        />
      ) : (
        <div className="rounded-lg bg-card shadow-card overflow-x-auto border border-border">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="p-3 text-left font-medium text-text-secondary">Warehouse</th>
                <th className="p-3 text-left font-medium text-text-secondary">Company</th>
                <th className="p-3 text-left font-medium text-text-secondary">Contact</th>
                <th className="p-3 text-left font-medium text-text-secondary">Wallet</th>
                <th className="p-3 text-left font-medium text-text-secondary">Orders / Ship</th>
                <th className="p-3 text-left font-medium text-text-secondary">Shopify</th>
                <th className="p-3 text-left font-medium text-text-secondary">Account</th>
                <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Warehouse className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-medium text-text-primary">{v.name}</span>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      {v.city} · {v.pin}
                    </p>
                  </td>
                  <td className="p-3 text-text-secondary">{v.companyName || "—"}</td>
                  <td className="p-3 text-text-secondary text-xs">
                    {v.email}
                    <br />
                    {v.phone}
                  </td>
                  <td className="p-3 tabular-nums font-medium">₹{(v.walletBalance ?? 0).toLocaleString("en-IN")}</td>
                  <td className="p-3 tabular-nums text-text-secondary">
                    {v.orderCount} / {v.shipmentCount}
                  </td>
                  <td className="p-3 text-xs">
                    {v.shopify?.connected ? (
                      <span className="text-success-dark">{v.shopify.shopDomain}</span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        v.accountStatus === "active"
                          ? "bg-success-light text-success-dark"
                          : v.accountStatus === "blocked"
                            ? "bg-danger-light text-danger-dark"
                            : "bg-surface-2 text-text-muted"
                      )}
                    >
                      {v.accountStatus}
                    </span>
                  </td>
                  <td className="p-3">
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setDetailId(v.id)}>
                      Manage
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
            <SheetTitle className="text-left pr-8">Vendor detail</SheetTitle>
          </SheetHeader>
          {detailLoading && <p className="text-sm text-text-muted mt-4">Loading…</p>}
          {!detailLoading && detail && (
            <div className="mt-4 space-y-3 text-sm">
              <p className="font-semibold text-text-primary">{String(detail.name ?? "")}</p>
              <p>
                <span className="text-text-muted">User:</span> {String(user?.name ?? "")} ({String(user?.email ?? "")})
              </p>
              <p>
                <span className="text-text-muted">Account status:</span> {String(user?.status ?? "")}
              </p>
              <p>
                <span className="text-text-muted">Vendor warehouse status:</span> {String(detail.vendorStatus ?? "")}
              </p>
              <p>
                <span className="text-text-muted">Wallet:</span> ₹
                {Number(detail.walletBalance ?? 0).toLocaleString("en-IN")}
              </p>
              <p>
                <span className="text-text-muted">Orders / Shipments:</span> {String(detail.orderCount ?? 0)} /{" "}
                {String(detail.shipmentCount ?? 0)}
              </p>
              <div className="rounded-md border border-border p-3 bg-surface-2/30">
                <p className="font-medium text-text-primary mb-1">Shopify</p>
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
                <Button size="sm" disabled={saving} onClick={() => void patchVendor({ userStatus: "active" })}>
                  Activate account
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void patchVendor({ userStatus: "inactive" })}
                >
                  Deactivate account
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={saving}
                  onClick={() => void patchVendor({ userStatus: "blocked" })}
                >
                  Block account
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => void patchVendor({ vendorStatus: "Active" })}
                >
                  Warehouse active
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={() => void patchVendor({ vendorStatus: "Inactive" })}
                >
                  Warehouse inactive
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
