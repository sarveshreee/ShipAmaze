import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Plus, Search, Trash2, Pencil, Package, Upload, Download,
  ChevronLeft, ChevronRight, MoreVertical, Layers, Images, X, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useSupplierProducts, type SupplierProduct } from "@/hooks/useSupplierProducts";
import * as productService from "@/services/productService";
import { downloadCSV } from "@/lib/exportUtils";

const fmtDate = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
};

const shortId = (id: string) => {
  // produce a short numeric-like identifier from uuid for display
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return String(10000 + (h % 90000));
};

export default function VendorProducts() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { data, isLoading, refetch } = useSupplierProducts();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [pageSize, setPageSize] = useState(12);
  const [page, setPage] = useState(1);

  const [imageModal, setImageModal] = useState<{ product: SupplierProduct; index: number } | null>(null);
  const [seqFor, setSeqFor] = useState<SupplierProduct | null>(null);
  const [variantsFor, setVariantsFor] = useState<SupplierProduct | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const categories = useMemo(
    () => Array.from(new Set(data.map((p) => p.category).filter(Boolean))),
    [data]
  );

  const filtered = useMemo(() => {
    let arr = data.filter((p) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q) ||
        (p.short_description || "").toLowerCase().includes(q) ||
        (p.long_description || "").toLowerCase().includes(q) ||
        shortId(p.id).includes(q);
      const matchCat = categoryFilter === "all" || p.category === categoryFilter;
      const matchStatus = statusFilter === "all" || p.status === statusFilter;
      return matchSearch && matchCat && matchStatus;
    });
    if (sortBy === "newest") arr = [...arr].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    if (sortBy === "oldest") arr = [...arr].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
    if (sortBy === "price-asc") arr = [...arr].sort((a, b) => a.selling_price - b.selling_price);
    if (sortBy === "price-desc") arr = [...arr].sort((a, b) => b.selling_price - a.selling_price);
    if (sortBy === "stock-desc") arr = [...arr].sort((a, b) => b.stock - a.stock);
    if (sortBy === "name") arr = [...arr].sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [data, search, categoryFilter, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageData = filtered.slice((page - 1) * pageSize, page * pageSize);

  const counts = useMemo(
    () => ({
      total: data.length,
      active: data.filter((p) => p.status === "active").length,
      draft: data.filter((p) => p.status === "draft").length,
      inactive: data.filter((p) => p.status === "inactive").length,
    }),
    [data]
  );

  // Clear selections when filters/page change so we never act on hidden rows
  useEffect(() => { setSelectedIds(new Set()); }, [search, categoryFilter, statusFilter, sortBy, page, pageSize]);


  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const toggleAllOnPage = (ids: string[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => { if (checked) next.add(id); else next.delete(id); });
      return next;
    });
  };

  const handleDeleteClick = () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one product to delete");
      return;
    }
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      for (const id of ids) {
        await productService.deleteProduct(id);
      }
      toast.success(`${ids.length} product${ids.length > 1 ? "s" : ""} deleted`);
      setSelectedIds(new Set());
      setDeleteOpen(false);
      await refetch();
    } catch (e: any) {
      toast.error(e.message || "Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  const toggleActive = async (p: SupplierProduct) => {
    const nextStatus: "active" | "inactive" = p.status === "active" ? "inactive" : "active";
    setTogglingId(p.id);
    try {
      await productService.updateProduct(p.id, { status: nextStatus });
      toast.success(`Marked ${nextStatus === "active" ? "Active" : "Inactive"}`);
      await refetch();
    } catch (e: any) {
      toast.error(e.message || "Failed to update");
    } finally {
      setTogglingId(null);
    }
  };

  const exportCSV = () => {
    if (!filtered.length) {
      toast.error("Nothing to export");
      return;
    }
    const headers = ["Product Id", "DD Id", "Name", "Created On", "Activated On", "TP Price", "App Price", "Stock", "Category", "Description", "Status"];
    const rows = filtered.map((p) => [
      shortId(p.id),
      shortId(p.id + "dd").slice(1),
      p.name,
      fmtDate(p.created_at),
      p.status === "active" ? fmtDate(p.updated_at) : "—",
      p.price,
      p.selling_price,
      p.stock,
      p.category || "—",
      p.short_description || p.long_description || "—",
      p.status,
    ] as (string | number)[]);
    downloadCSV(`my-products-${new Date().toISOString().slice(0, 10)}`, headers, rows);
    toast.success(`Exported ${rows.length} products`);
  };

  const openImageModal = (p: SupplierProduct) => {
    if (!p.images || p.images.length === 0) {
      toast.message("No images for this product");
      return;
    }
    setImageModal({ product: p, index: p.primary_image_index || 0 });
  };

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="My Products"
        breadcrumb={["Vendor", "Products"]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-2" />Export CSV
            </Button>
            <Button variant="outline" onClick={() => navigate(`/${role}/bulk-upload-products`)}>
              <Upload className="h-4 w-4 mr-2" />Bulk Upload
            </Button>
            <Button
              variant="outline"
              onClick={handleDeleteClick}
              disabled={selectedIds.size === 0}
              className={cn(selectedIds.size > 0 && "border-danger text-danger hover:bg-danger-light hover:text-danger-dark")}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </Button>
            <Button
              className="bg-warning text-warning-foreground hover:bg-warning/90"
              onClick={() => navigate(`/${role}/source-product`)}
            >
              <Plus className="h-4 w-4 mr-2" />Add Product
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="rounded-xl bg-card shadow-card p-4 mb-4 flex flex-wrap gap-2 items-center">
        <h2 className="text-base font-semibold text-text-primary">Manage Your Inventory Listings</h2>
        <div className="flex flex-wrap gap-2 ml-auto">
          {[
            { label: "Total", value: counts.total, color: "bg-warning-light text-warning-dark" },
            { label: "Active", value: counts.active, color: "bg-success-light text-success-dark" },
            { label: "Draft", value: counts.draft, color: "bg-surface-2 text-text-secondary" },
            { label: "Inactive", value: counts.inactive, color: "bg-danger-light text-danger-dark" },
          ].map((s) => (
            <span key={s.label} className={cn("px-3 py-1 rounded-full text-xs font-bold", s.color)}>
              {s.value} {s.label.toUpperCase()}
            </span>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl bg-card shadow-card p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input
            className="pl-9"
            placeholder="Search by name, SKU, or status..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="price-asc">Price ↑</SelectItem>
            <SelectItem value="price-desc">Price ↓</SelectItem>
            <SelectItem value="stock-desc">Stock ↓</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
          <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[12, 24, 48, 100].map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-xl bg-card shadow-card p-10 text-center text-text-muted">Loading products…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl bg-card shadow-card p-10 text-center">
          <Package className="h-10 w-10 mx-auto text-text-muted mb-3" />
          <h3 className="font-semibold text-text-primary">No products found</h3>
          <p className="text-sm text-text-muted mt-1">Once you add products, they will appear here.</p>
          <div className="flex gap-2 justify-center mt-4">
            <Button
              className="bg-warning text-warning-foreground hover:bg-warning/90"
              onClick={() => navigate(`/${role}/source-product`)}
            >
              <Plus className="h-4 w-4 mr-1" />Add Product
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl bg-card shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            {(() => {
              const pageIdList = pageData.map((p) => p.id);
              const allOnPageSelected = pageIdList.length > 0 && pageIdList.every((id) => selectedIds.has(id));
              const someOnPageSelected = pageIdList.some((id) => selectedIds.has(id)) && !allOnPageSelected;
              return (
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-text-secondary text-xs uppercase tracking-wide sticky top-0">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold w-10">
                    <Checkbox
                      checked={allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false}
                      onCheckedChange={(v) => toggleAllOnPage(pageIdList, !!v)}
                      aria-label="Select all on page"
                    />
                  </th>
                  <th className="px-3 py-3 text-left font-semibold">Product Id</th>
                  <th className="px-3 py-3 text-left font-semibold">DD Id</th>
                  <th className="px-3 py-3 text-left font-semibold">Image</th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[160px]">Product Details</th>
                  <th className="px-3 py-3 text-left font-semibold">Created On</th>
                  <th className="px-3 py-3 text-left font-semibold">Is Activate</th>
                  <th className="px-3 py-3 text-left font-semibold">TP Price</th>
                  <th className="px-3 py-3 text-left font-semibold">App Price</th>
                  <th className="px-3 py-3 text-left font-semibold">Stock</th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[180px]">Category Name</th>
                  <th className="px-3 py-3 text-left font-semibold min-w-[180px]">Description</th>
                  <th className="px-3 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((p) => {
                  const img = p.images?.[p.primary_image_index] || p.images?.[0];
                  const isSelected = selectedIds.has(p.id);
                  const isActive = p.status === "active";
                  return (
                    <tr key={p.id} className={cn("border-t border-border hover:bg-surface-1 transition-colors", isSelected && "bg-primary/5")}>
                      <td className="px-3 py-3 align-top">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(v) => toggleOne(p.id, !!v)}
                          aria-label={`Select ${p.name}`}
                        />
                      </td>
                      <td className="px-3 py-3 align-top text-text-primary font-medium">{shortId(p.id)}</td>
                      <td className="px-3 py-3 align-top text-text-secondary">{shortId(p.id + "dd").slice(1)}</td>
                      <td className="px-3 py-3 align-top">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => openImageModal(p)}
                                className="h-12 w-12 rounded-md bg-surface-2 border border-border flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-primary transition"
                              >
                                {img ? (
                                  <img src={img} alt={p.name} className="h-full w-full object-cover" />
                                ) : (
                                  <Package className="h-5 w-5 text-text-muted" />
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Click to see images</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-text-primary font-medium line-clamp-2 cursor-default">
                                {p.name}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{p.name}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {p.sku && <div className="text-[11px] font-mono text-text-muted mt-0.5">{p.sku}</div>}
                      </td>
                      <td className="px-3 py-3 align-top text-text-secondary whitespace-nowrap">{fmtDate(p.created_at)}</td>
                      <td className="px-3 py-3 align-top whitespace-nowrap">
                        <button
                          type="button"
                          disabled={togglingId === p.id}
                          onClick={() => toggleActive(p)}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition",
                            isActive
                              ? "bg-success-light text-success-dark border-success/30 hover:bg-success/20"
                              : "bg-surface-2 text-text-muted border-border hover:bg-danger-light hover:text-danger-dark hover:border-danger/30",
                            togglingId === p.id && "opacity-60 cursor-wait"
                          )}
                          title={isActive ? "Click to mark Inactive" : "Click to mark Active"}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", isActive ? "bg-success" : "bg-text-muted")} />
                          {isActive ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-3 py-3 align-top text-text-primary">{p.price}</td>
                      <td className="px-3 py-3 align-top text-text-primary">{p.selling_price}</td>
                      <td className={cn("px-3 py-3 align-top", p.stock <= 5 ? "text-danger font-medium" : "text-text-primary")}>
                        {p.stock}
                      </td>
                      <td className="px-3 py-3 align-top text-text-secondary">
                        <div className="max-w-[220px] whitespace-normal break-words">{p.category || "—"}</div>
                      </td>
                      <td className="px-3 py-3 align-top text-text-secondary">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="max-w-[220px] line-clamp-2 cursor-default">
                                {p.short_description || p.long_description || "—"}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              {p.short_description || p.long_description || "—"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </td>
                      <td className="px-3 py-3 align-top text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => navigate(`/${role}/source-product?id=${p.id}`)}>
                              <Pencil className="h-4 w-4 mr-2 text-primary" />Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setVariantsFor(p)}>
                              <Layers className="h-4 w-4 mr-2 text-primary" />Variants
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setSeqFor(p)}>
                              <Images className="h-4 w-4 mr-2 text-primary" />Image Sequence
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-danger focus:text-danger"
                              onClick={() => { setSelectedIds(new Set([p.id])); setDeleteOpen(true); }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
              );
            })()}
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border">
            <p className="text-xs text-text-muted">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }).slice(0, 5).map((_, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant={page === i + 1 ? "default" : "outline"}
                  className={page === i + 1 ? "bg-warning text-warning-foreground hover:bg-warning/90" : ""}
                  onClick={() => setPage(i + 1)}
                >
                  {i + 1}
                </Button>
              ))}
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      <Dialog open={deleteOpen} onOpenChange={(o) => !deleting && setDeleteOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="h-9 w-9 rounded-full bg-danger-light text-danger-dark flex items-center justify-center">
                <AlertTriangle className="h-5 w-5" />
              </span>
              Delete Products
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-text-primary">
                {selectedIds.size} selected product{selectedIds.size > 1 ? "s" : ""}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              className="bg-danger text-danger-foreground hover:bg-danger/90"
              onClick={confirmDelete}
              disabled={deleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image preview modal */}
      <Dialog open={!!imageModal} onOpenChange={(o) => !o && setImageModal(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Product Images</DialogTitle>
          </DialogHeader>
          {imageModal && (
            <div className="relative">
              <div className="bg-surface-2 rounded-lg flex items-center justify-center aspect-video overflow-hidden">
                <img
                  src={imageModal.product.images[imageModal.index]}
                  alt={imageModal.product.name}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              {imageModal.product.images.length > 1 && (
                <>
                  <button
                    onClick={() =>
                      setImageModal((m) =>
                        m
                          ? {
                              ...m,
                              index: (m.index - 1 + m.product.images.length) % m.product.images.length,
                            }
                          : m
                      )
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-card border border-border flex items-center justify-center hover:bg-primary hover:text-primary-foreground"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() =>
                      setImageModal((m) =>
                        m
                          ? { ...m, index: (m.index + 1) % m.product.images.length }
                          : m
                      )
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-card border border-border flex items-center justify-center hover:bg-primary hover:text-primary-foreground"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                  <div className="flex justify-center gap-1.5 mt-3">
                    {imageModal.product.images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setImageModal((m) => (m ? { ...m, index: i } : m))}
                        className={cn(
                          "h-1.5 rounded-full transition-all",
                          i === imageModal.index ? "w-6 bg-primary" : "w-1.5 bg-border"
                        )}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Variants modal */}
      <Dialog open={!!variantsFor} onOpenChange={(o) => !o && setVariantsFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Variants — {variantsFor?.name}</DialogTitle>
          </DialogHeader>
          <VariantList productId={variantsFor?.id} />
        </DialogContent>
      </Dialog>

      {/* Image sequence modal */}
      <ImageSequenceModal
        product={seqFor}
        onClose={() => setSeqFor(null)}
      />
    </div>
  );
}

function VariantList({ productId }: { productId?: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    void (async () => {
      try {
        const data = (await productService.getProductVariants(productId)) as unknown[];
        setRows(Array.isArray(data) ? data : []);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [productId]);

  if (loading) return <p className="text-sm text-text-muted">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-text-muted">No variants for this product.</p>;
  return (
    <table className="w-full text-xs">
      <thead className="bg-surface-2 text-text-muted uppercase tracking-wide">
        <tr>
          <th className="px-2 py-2 text-left">Variant</th>
          <th className="px-2 py-2 text-left">SKU</th>
          <th className="px-2 py-2 text-left">Price</th>
          <th className="px-2 py-2 text-left">Stock</th>
          <th className="px-2 py-2 text-left">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((v) => (
          <tr key={v.id} className="border-t border-border">
            <td className="px-2 py-1">
              {[v.option1_value, v.option2_value].filter(Boolean).join(" / ") || "—"}
            </td>
            <td className="px-2 py-1 font-mono">{v.sku}</td>
            <td className="px-2 py-1">₹{v.price}</td>
            <td className="px-2 py-1">{v.stock}</td>
            <td className="px-2 py-1 capitalize">{v.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ImageSequenceModal({
  product,
  onClose,
}: {
  product: SupplierProduct | null;
  onClose: () => void;
}) {
  const [order, setOrder] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOrder(product?.images ? [...product.images] : []);
  }, [product]);

  if (!product) return null;

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };

  const save = async () => {
    setSaving(true);
    try {
      await productService.updateProduct(product.id, { images: order, primary_image_index: 0, primaryImageIndex: 0 });
      toast.success("Image order updated");
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Image Sequence — {product.name}</DialogTitle>
        </DialogHeader>
        {order.length === 0 ? (
          <p className="text-sm text-text-muted">No images uploaded for this product.</p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-auto">
            {order.map((url, i) => (
              <div key={url + i} className="flex items-center gap-3 rounded-md border border-border p-2 bg-surface-1">
                <span className="text-xs font-mono w-6 text-text-muted">#{i + 1}</span>
                <img src={url} alt="" className="h-12 w-12 rounded object-cover bg-surface-2" />
                <span className="text-xs text-text-secondary truncate flex-1">{url.split("/").pop()}</span>
                <Button size="sm" variant="outline" onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
                <Button size="sm" variant="outline" onClick={() => move(i, 1)} disabled={i === order.length - 1}>↓</Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1" />Cancel
          </Button>
          <Button
            className="bg-warning text-warning-foreground hover:bg-warning/90"
            onClick={save}
            disabled={saving || order.length === 0}
          >
            Save Order
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
