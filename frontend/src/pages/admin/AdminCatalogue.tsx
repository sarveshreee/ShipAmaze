import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import * as adminWorkflowService from "@/services/adminWorkflowService";
import type { CatalogueProductRow } from "@/services/adminWorkflowService";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Layers, Loader2, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/apiClient";

export default function AdminCatalogue() {
  const [items, setItems] = useState<CatalogueProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [category, setCategory] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [stockStatus, setStockStatus] = useState<string>("all");
  const [sort, setSort] = useState("-createdAt");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [vendors, setVendors] = useState<adminWorkflowService.AdminVendorRow[]>([]);
  const [detail, setDetail] = useState<CatalogueProductRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  const loadVendors = useCallback(async () => {
    try {
      const r = await adminWorkflowService.adminListVendors({ limit: "200" });
      setVendors(r.items ?? []);
    } catch {
      setVendors([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminWorkflowService.adminListCatalogue({
        page: String(page),
        limit: String(limit),
        search: searchDebounced || undefined,
        category: category.trim() || undefined,
        vendorId: vendorId && vendorId !== "all" ? vendorId : undefined,
        status: status !== "all" ? status : undefined,
        stockStatus: stockStatus !== "all" ? stockStatus : undefined,
        sort,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setItems(r.items ?? []);
      setTotal(r.total ?? 0);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setError(e instanceof ApiError ? e.message : "Failed to load catalogue");
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchDebounced, category, vendorId, status, stockStatus, sort, dateFrom, dateTo]);

  useEffect(() => {
    void loadVendors();
  }, [loadVendors]);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const p of items) {
      const c = (p.category || "").trim();
      if (c) s.add(c);
    }
    return [...s].sort();
  }, [items]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  };

  const runBulk = async (action: string) => {
    const ids = [...selected];
    if (!ids.length) {
      toast.message("Select at least one product");
      return;
    }
    setSaving(true);
    try {
      const r = await adminWorkflowService.adminBulkCatalogue(ids, action);
      toast.success(`Updated ${r.modified} product(s)`);
      setSelected(new Set());
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Bulk action failed");
    } finally {
      setSaving(false);
    }
  };

  const patchProduct = async (id: string, patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await adminWorkflowService.adminPatchCatalogueProduct(id, patch);
      toast.success("Product updated");
      setDetail((d) => (d && d.id === id ? { ...d, ...patch } : d));
      await load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="animate-fade-in-up space-y-4">
      <PageHeader title="Admin catalogue" breadcrumb={["Admin", "Catalogue"]} />

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-card">
        <div className="flex flex-col lg:flex-row gap-3 flex-wrap">
          <Input
            placeholder="Search name, SKU, vendor…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="max-w-md"
          />
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending_review">Pending review</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={vendorId || "all"}
            onValueChange={(v) => {
              setVendorId(v === "all" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Vendor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.companyName || v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Category filter"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="w-full sm:w-[160px]"
            list="admin-catalogue-cats"
          />
          <datalist id="admin-catalogue-cats">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <Select
            value={stockStatus}
            onValueChange={(v) => {
              setStockStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Stock" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stock</SelectItem>
              <SelectItem value="in_stock">In stock (&gt;5)</SelectItem>
              <SelectItem value="low">Low (1–5)</SelectItem>
              <SelectItem value="out_of_stock">Out of stock</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2 items-center flex-wrap">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="w-[150px]"
            />
            <span className="text-text-muted text-sm">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="w-[150px]"
            />
          </div>
          <Select
            value={sort}
            onValueChange={(v) => {
              setSort(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="-createdAt">Newest first</SelectItem>
              <SelectItem value="createdAt">Oldest first</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
              <SelectItem value="-name">Name Z–A</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap gap-2 items-center border-t border-border pt-3">
            <span className="text-sm text-text-muted">{selected.size} selected</span>
            <Button size="sm" variant="secondary" disabled={saving} onClick={() => void runBulk("approve")}>
              Approve / activate
            </Button>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => void runBulk("deactivate")}>
              Deactivate
            </Button>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => void runBulk("pending_review")}>
              Mark pending review
            </Button>
            <Button size="sm" variant="destructive" disabled={saving} onClick={() => void runBulk("reject")}>
              Reject
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger-light/30 px-4 py-3 text-sm text-text-primary flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </div>
      )}

      {loading && !items.length ? (
        <div className="animate-pulse p-8 text-text-muted flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading catalogue…
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No products match"
          description="Adjust filters or search, or add products from the supplier flow."
          actionLabel="Retry"
          onAction={() => void load()}
        />
      ) : (
        <div className="rounded-lg bg-card shadow-card overflow-x-auto border border-border">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="p-2 w-10">
                  <Checkbox
                    checked={items.length > 0 && selected.size === items.length}
                    onCheckedChange={() => toggleSelectAll()}
                    aria-label="Select all"
                  />
                </th>
                <th className="p-3 text-left font-medium text-text-secondary">Product</th>
                <th className="p-3 text-left font-medium text-text-secondary">SKU</th>
                <th className="p-3 text-left font-medium text-text-secondary">Vendor</th>
                <th className="p-3 text-left font-medium text-text-secondary">Stock</th>
                <th className="p-3 text-left font-medium text-text-secondary">Status</th>
                <th className="p-3 text-left font-medium text-text-secondary">Created</th>
                <th className="p-3 text-left font-medium text-text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                  <td className="p-2">
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={() => toggleSelect(p.id)}
                      aria-label={`Select ${p.name}`}
                    />
                  </td>
                  <td className="p-3 font-medium text-text-primary max-w-[200px] truncate">{p.name}</td>
                  <td className="p-3 font-mono text-xs text-text-secondary">{p.sku || "—"}</td>
                  <td className="p-3 text-text-secondary max-w-[140px] truncate">{p.vendorName || "—"}</td>
                  <td className="p-3 tabular-nums">{p.stock ?? "—"}</td>
                  <td className="p-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        p.status === "active"
                          ? "bg-success-light text-success-dark"
                          : p.status === "rejected"
                            ? "bg-danger-light text-danger-dark"
                            : "bg-surface-2 text-text-muted"
                      )}
                    >
                      {p.status || "—"}
                    </span>
                  </td>
                  <td className="p-3 text-text-muted text-xs whitespace-nowrap">
                    {p.createdAt ? new Date(p.createdAt).toLocaleDateString("en-IN") : "—"}
                  </td>
                  <td className="p-3">
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setDetail(p)}>
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
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-text-muted">
            Page {page} of {totalPages} ({total} items)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left pr-8">{detail.name}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <p>
                  <span className="text-text-muted">SKU:</span> {detail.sku || "—"}
                </p>
                <p>
                  <span className="text-text-muted">Category:</span> {detail.category || "—"}
                </p>
                <p>
                  <span className="text-text-muted">Vendor:</span> {detail.vendorName || "—"}{" "}
                  {detail.uploadedByRole && (
                    <span className="text-xs text-text-muted">({detail.uploadedByRole})</span>
                  )}
                </p>
                <p>
                  <span className="text-text-muted">Price / Selling:</span> ₹{detail.price ?? 0} / ₹
                  {detail.sellingPrice ?? 0}
                </p>
                <p>
                  <span className="text-text-muted">Stock:</span> {detail.stock ?? 0}
                </p>
                <p>
                  <span className="text-text-muted">Status:</span> {detail.status}
                </p>
                {detail.images?.[0] && (
                  <img src={detail.images[0]} alt="" className="rounded-md max-h-40 object-contain border border-border" />
                )}
                <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
                  <Button
                    size="sm"
                    disabled={saving}
                    onClick={() => void patchProduct(detail.id, { status: "active" })}
                  >
                    Approve / activate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void patchProduct(detail.id, { status: "inactive" })}
                  >
                    Deactivate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={saving}
                    onClick={() => void patchProduct(detail.id, { status: "pending_review" })}
                  >
                    Pending review
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={saving}
                    onClick={() => void patchProduct(detail.id, { status: "rejected" })}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
