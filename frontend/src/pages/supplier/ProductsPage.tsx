import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Search, Trash2, Pencil, Copy, Tag, FileText, IndianRupee, Package, Power, Upload, Eye, Download, CheckSquare, FolderInput } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useSupplierProducts, type SupplierProduct } from "@/hooks/useSupplierProducts";
import { ProductStatusBadge } from "@/components/supplier/StatusBadge";
import * as productService from "@/services/productService";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionBar } from "@/components/BulkActionBar";
import { downloadCSV } from "@/lib/exportUtils";

export default function ProductsPage() {
  const navigate = useNavigate();
  const { role, userId } = useAuth();
  const { data, isLoading, refetch } = useSupplierProducts();

  const isAdmin = role === "admin";
  const isVendor = role === "vendor";
  const isDropshipper = role === "dropshipper";
  const canManage = isAdmin || isVendor; // dropshippers are read-only

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [pageSize, setPageSize] = useState(12);
  const [page, setPage] = useState(1);
  const [variantsFor, setVariantsFor] = useState<SupplierProduct | null>(null);
  const [detailsFor, setDetailsFor] = useState<SupplierProduct | null>(null);
  const [priceReqFor, setPriceReqFor] = useState<SupplierProduct | null>(null);
  const [priceMsg, setPriceMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<SupplierProduct | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkCategoryValue, setBulkCategoryValue] = useState("");
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const categories = useMemo(() => Array.from(new Set(data.map(p => p.category).filter(Boolean))), [data]);
  const vendors = useMemo(() => {
    const map = new Map<string, string>();
    data.forEach(p => { if (p.vendor_id) map.set(p.vendor_id, p.vendor_name || p.vendor_id.slice(0, 8)); });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  const filtered = useMemo(() => {
    let arr = data.filter(p => {
      const q = search.toLowerCase();
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.status.includes(q) || (p.vendor_name || "").toLowerCase().includes(q);
      const matchCat = categoryFilter === "all" || p.category === categoryFilter;
      const matchStatus = statusFilter === "all" || p.status === statusFilter;
      const matchVendor = vendorFilter === "all" || p.vendor_id === vendorFilter;
      return matchSearch && matchCat && matchStatus && matchVendor;
    });
    if (sortBy === "newest") arr = [...arr].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    if (sortBy === "oldest") arr = [...arr].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
    if (sortBy === "price-asc") arr = [...arr].sort((a, b) => a.selling_price - b.selling_price);
    if (sortBy === "price-desc") arr = [...arr].sort((a, b) => b.selling_price - a.selling_price);
    if (sortBy === "name") arr = [...arr].sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [data, search, categoryFilter, statusFilter, vendorFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageData = filtered.slice((page - 1) * pageSize, page * pageSize);

  const counts = useMemo(() => ({
    total: data.length,
    active: data.filter(p => p.status === "active").length,
    draft: data.filter(p => p.status === "draft").length,
    inactive: data.filter(p => p.status === "inactive").length,
  }), [data]);

  const resetFilters = () => { setSearch(""); setCategoryFilter("all"); setStatusFilter("all"); setVendorFilter("all"); setSortBy("newest"); setPage(1); };

  const updateStatus = async (p: SupplierProduct, status: SupplierProduct["status"]) => {
    try {
      await productService.updateProduct(p.id, { status });
      toast.success(`${p.name} → ${status}`);
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const duplicate = async (p: SupplierProduct) => {
    const { id, created_at, updated_at, ...rest } = p as any;
    const payload = { ...rest, sku: `${p.sku || "SKU"}-COPY`, name: `${p.name} (Copy)`, status: "draft" };
    try {
      await productService.createProduct(payload);
      toast.success("Duplicated");
      refetch();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Duplicate failed");
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const p = confirmDelete;
    try {
      await productService.deleteProduct(p.id);
      toast.success("Deleted");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
    setConfirmDelete(null);
    refetch();
  };

  const submitPriceRequest = async () => {
    if (!priceReqFor || !priceMsg.trim()) { toast.error("Enter your message"); return; }
    const payload = {
      name: `Price request: ${priceReqFor.name}`,
      category: priceReqFor.category,
      proposed_sku: priceReqFor.sku,
      estimated_price: priceReqFor.selling_price,
      description: priceMsg,
    };
    try {
      await productService.createProductRequest(payload);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Request failed");
      return;
    }
    toast.success("Price request submitted");
    setPriceReqFor(null); setPriceMsg("");
  };

  // ===== Bulk operations =====
  const toggleOne = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const togglePageAll = () => {
    const ids = pageData.map(p => p.id);
    const allSelected = ids.every(id => selected.has(id));
    setSelected(prev => {
      const n = new Set(prev);
      if (allSelected) ids.forEach(id => n.delete(id));
      else ids.forEach(id => n.add(id));
      return n;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const bulkUpdateStatus = async (status: SupplierProduct["status"]) => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    try {
      for (const id of ids) {
        await productService.updateProduct(id, { status });
      }
      toast.success(`${ids.length} product${ids.length > 1 ? "s" : ""} → ${status}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Bulk update failed");
    }
    clearSelection();
    refetch();
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    try {
      for (const id of ids) {
        await productService.deleteProduct(id);
      }
      toast.success(`${ids.length} deleted`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Bulk delete failed");
    }
    clearSelection();
    setConfirmBulkDelete(false);
    refetch();
  };

  const bulkChangeCategory = async () => {
    const ids = Array.from(selected);
    const cat = bulkCategoryValue.trim();
    if (!ids.length || !cat) {
      toast.error("Enter a category");
      return;
    }
    try {
      for (const id of ids) {
        await productService.updateProduct(id, { category: cat });
      }
      toast.success(`Category set on ${ids.length} product${ids.length > 1 ? "s" : ""}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
    setBulkCategoryOpen(false);
    setBulkCategoryValue("");
    clearSelection();
    refetch();
  };

  // ===== CSV Export (matches bulk upload template) =====
  const exportCSV = () => {
    if (!filtered.length) { toast.error("Nothing to export"); return; }
    const headers = [
      "name","sku","category","brand","status","price","selling_price","stock","weight","hsn",
      "short_description","long_description","tags","unit","min_order_qty",
      "length_cm","width_cm","height_cm","shipping_class","cod_available","returnable","fragile",
      "gst_percent","country_of_origin","warranty","manufacturer","care_instructions","seo_title","seo_description"
    ];
    const rows = filtered.map(p => [
      p.name, p.sku, p.category, p.brand, p.status, p.price, p.selling_price, p.stock, p.weight, p.hsn,
      p.short_description, p.long_description, (p.tags || []).join("|"), p.unit, p.min_order_qty,
      p.length_cm ?? "", p.width_cm ?? "", p.height_cm ?? "", p.shipping_class,
      p.cod_available ? "true" : "false", p.returnable ? "true" : "false", p.fragile ? "true" : "false",
      p.gst_percent, p.country_of_origin, p.warranty, p.manufacturer, p.care_instructions,
      p.seo_title, p.seo_description
    ] as (string|number)[]);
    downloadCSV(`products-${new Date().toISOString().slice(0,10)}`, headers, rows);
    toast.success(`Exported ${rows.length} product${rows.length>1?"s":""}`);
  };

  const allOnPageSelected = pageData.length > 0 && pageData.every(p => selected.has(p.id));

  return (
    <div className="animate-fade-in-up">
      <PageHeader title={isAdmin ? "All Products" : isDropshipper ? "Product Catalog" : "My Products"} breadcrumb={[role.charAt(0).toUpperCase() + role.slice(1), "Products"]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportCSV}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
            {canManage && (
              <>
                <Button variant="outline" onClick={() => navigate(`/${role}/bulk-upload-products`)}><Upload className="h-4 w-4 mr-2" />Bulk Upload</Button>
                <Button variant="outline" onClick={() => navigate(`/${role}/products?status=trash`)}><Trash2 className="h-4 w-4 mr-2" />Trash</Button>
                <Button className="bg-warning text-warning-foreground hover:bg-warning/90" onClick={() => navigate(`/${role}/source-product`)}>
                  <Plus className="h-4 w-4 mr-2" />Add Product
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Stats */}
      <div className="rounded-xl bg-card shadow-card p-4 mb-4 flex flex-wrap gap-2 items-center">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Manage Your Inventory Listings</h2>
        </div>
        <div className="flex flex-wrap gap-2 ml-auto">
          {[
            { label: "Total", value: counts.total, color: "bg-warning-light text-warning-dark" },
            { label: "Active", value: counts.active, color: "bg-success-light text-success-dark" },
            { label: "Draft", value: counts.draft, color: "bg-surface-2 text-text-secondary" },
            { label: "Inactive", value: counts.inactive, color: "bg-danger-light text-danger-dark" },
          ].map(s => (
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
          <Input className="pl-9" placeholder="Search by name, SKU, or status..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={categoryFilter} onValueChange={v => { setCategoryFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Categories</SelectItem>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        {isAdmin && (
          <Select value={vendorFilter} onValueChange={v => { setVendorFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Vendor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vendors</SelectItem>
              {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {!isDropshipper && (
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem><SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem><SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem><SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="price-asc">Price ↑</SelectItem><SelectItem value="price-desc">Price ↓</SelectItem>
            <SelectItem value="name">Name A–Z</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
          <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>{[12,24,48].map(n => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="rounded-xl bg-surface-2 h-72 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl bg-card shadow-card p-10 text-center">
          <Package className="h-10 w-10 mx-auto text-text-muted mb-3" />
          <h3 className="font-semibold text-text-primary">No products found</h3>
          <p className="text-sm text-text-muted mt-1">Try adjusting your filters or add a new product.</p>
          <div className="flex gap-2 justify-center mt-4">
            <Button variant="outline" onClick={resetFilters}>Reset Filters</Button>
            {canManage && (
              <Button className="bg-warning text-warning-foreground hover:bg-warning/90" onClick={() => navigate(`/${role}/source-product`)}><Plus className="h-4 w-4 mr-1" />Add Product</Button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Select-all bar */}
          {canManage && (
            <div className="flex items-center gap-3 mb-3 px-1 text-sm text-text-secondary">
              <Checkbox checked={allOnPageSelected} onCheckedChange={togglePageAll} />
              <span>{allOnPageSelected ? "Deselect" : "Select"} all on this page</span>
              {selected.size > 0 && (
                <button onClick={clearSelection} className="ml-auto text-xs text-primary hover:underline">Clear ({selected.size})</button>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {pageData.map(p => {
              const img = p.images[p.primary_image_index] || p.images[0];
              const isSel = selected.has(p.id);
              return (
                <div key={p.id} className={cn("group rounded-xl bg-card shadow-card hover:shadow-card-lg transition-shadow overflow-hidden flex flex-col", isSel && "ring-2 ring-primary")}>
                  <div className="relative aspect-square bg-surface-2 flex items-center justify-center">
                    {img ? <img src={img} alt={p.name} className="w-full h-full object-cover" /> : <Package className="h-10 w-10 text-text-muted" />}
                    <div className="absolute top-2 left-2 flex items-center gap-2">
                      {canManage && (
                        <div className={cn("h-6 w-6 rounded bg-card border border-border flex items-center justify-center transition-opacity", isSel ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                          <Checkbox checked={isSel} onCheckedChange={() => toggleOne(p.id)} />
                        </div>
                      )}
                      <ProductStatusBadge status={p.status} />
                    </div>
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { sessionStorage.setItem("product_preview", JSON.stringify({ ...p, tags: p.tags || [], variants: [] })); window.open("/product-preview", "_blank", "noopener"); }} title="Preview" className="h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center hover:bg-primary hover:text-primary-foreground"><Eye className="h-3 w-3" /></button>
                      {canManage && (
                        <>
                          <button onClick={() => navigate(`/${role}/source-product?id=${p.id}`)} title="Edit" className="h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center hover:bg-primary hover:text-primary-foreground"><Pencil className="h-3 w-3" /></button>
                          <button onClick={() => setConfirmDelete(p)} title="Delete" className="h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center hover:bg-danger hover:text-white"><Trash2 className="h-3 w-3" /></button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="p-3 flex flex-col flex-1">
                    <h3 className="font-semibold text-sm text-warning-dark truncate">{p.name}</h3>
                    <p className="font-bold text-text-primary mt-1">₹{p.selling_price}</p>
                    <div className="flex items-center justify-between text-xs text-text-muted mt-1">
                      <span className="font-mono">{p.sku || "—"}</span>
                      <span>{p.brand || "Self"}</span>
                    </div>
                    {isAdmin && p.vendor_name && (
                      <div className="mt-2 text-[11px] text-text-muted border-t border-border pt-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-text-secondary truncate"><span className="font-semibold">Vendor:</span> {p.vendor_name}</span>
                          {p.uploaded_by_role && <span className="px-1.5 py-0.5 rounded bg-surface-2 capitalize">{p.uploaded_by_role}</span>}
                        </div>
                        {p.created_at && <p className="mt-0.5">Uploaded {new Date(p.created_at).toLocaleDateString()}</p>}
                      </div>
                    )}
                    {isDropshipper ? (
                      <div className="grid grid-cols-2 gap-1.5 mt-3">
                        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setDetailsFor(p)}><FileText className="h-3 w-3 mr-1" />View</Button>
                        <Button size="sm" className="h-7 text-[11px] bg-warning text-warning-foreground hover:bg-warning/90" onClick={() => navigate(`/${role}/create-order?product=${p.id}`)}><Package className="h-3 w-3 mr-1" />Sell</Button>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-1.5 mt-3">
                          <Button size="sm" variant="outline" className="h-7 text-[11px] text-warning border-warning/30 hover:bg-warning-light" onClick={() => setVariantsFor(p)}><Tag className="h-3 w-3 mr-1" />Variants</Button>
                          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setDetailsFor(p)}><FileText className="h-3 w-3 mr-1" />Details</Button>
                        </div>
                        <Button size="sm" variant="outline" className="h-7 mt-1.5 text-[11px] text-primary border-primary/30 hover:bg-primary/10" onClick={() => setPriceReqFor(p)}>
                          <IndianRupee className="h-3 w-3 mr-1" />Price Request
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 mt-1 text-[11px]" onClick={() => updateStatus(p, p.status === "active" ? "inactive" : "active")}>
                          <Power className="h-3 w-3 mr-1" />{p.status === "active" ? "Deactivate" : "Activate"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 mt-1 text-[11px]" onClick={() => duplicate(p)}>
                          <Copy className="h-3 w-3 mr-1" />Duplicate
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4 px-1">
            <p className="text-xs text-text-muted">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</Button>
              {Array.from({ length: totalPages }).slice(0, 5).map((_, i) => (
                <Button key={i} size="sm" variant={page === i + 1 ? "default" : "outline"} className={page === i + 1 ? "bg-warning text-warning-foreground hover:bg-warning/90" : ""} onClick={() => setPage(i + 1)}>{i + 1}</Button>
              ))}
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</Button>
            </div>
          </div>
        </>
      )}

      {/* Variants modal */}
      <Dialog open={!!variantsFor} onOpenChange={o => !o && setVariantsFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Variants — {variantsFor?.name}</DialogTitle></DialogHeader>
          <VariantList productId={variantsFor?.id} />
        </DialogContent>
      </Dialog>

      {/* Details modal */}
      <Dialog open={!!detailsFor} onOpenChange={o => !o && setDetailsFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{detailsFor?.name}</DialogTitle><DialogDescription>{detailsFor?.category} · {detailsFor?.brand}</DialogDescription></DialogHeader>
          {detailsFor && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="SKU" value={detailsFor.sku || "—"} />
              <Stat label="Price" value={`₹${detailsFor.price}`} />
              <Stat label="Selling Price" value={`₹${detailsFor.selling_price}`} />
              <Stat label="Stock" value={detailsFor.stock} />
              <Stat label="Weight" value={detailsFor.weight || "—"} />
              <Stat label="HSN" value={detailsFor.hsn || "—"} />
              <Stat label="GST" value={`${detailsFor.gst_percent}%`} />
              <Stat label="Origin" value={detailsFor.country_of_origin} />
              <div className="col-span-2"><p className="text-xs uppercase text-text-muted mb-1">Description</p><p>{detailsFor.long_description || detailsFor.short_description || "—"}</p></div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Price request modal */}
      <Dialog open={!!priceReqFor} onOpenChange={o => !o && setPriceReqFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Price Request — {priceReqFor?.name}</DialogTitle><DialogDescription>Submit a request to update or quote pricing.</DialogDescription></DialogHeader>
          <textarea className="w-full min-h-[120px] rounded-md border border-border p-2 text-sm" placeholder="Describe your pricing request…" value={priceMsg} onChange={e => setPriceMsg(e.target.value)} />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPriceReqFor(null)}>Cancel</Button><Button className="bg-warning text-warning-foreground hover:bg-warning/90" onClick={submitPriceRequest}>Submit</Button></div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={o => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete product?</AlertDialogTitle><AlertDialogDescription>This will remove "{confirmDelete?.name}" permanently.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={doDelete} className="bg-danger text-white hover:bg-danger/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirm */}
      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete {selected.size} products?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={bulkDelete} className="bg-danger text-white hover:bg-danger/90">Delete All</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk change category */}
      <Dialog open={bulkCategoryOpen} onOpenChange={setBulkCategoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Change category for {selected.size} products</DialogTitle><DialogDescription>Pick existing or type a new category.</DialogDescription></DialogHeader>
          <Input list="bulk-cat-list" placeholder="e.g. Apparel" value={bulkCategoryValue} onChange={e => setBulkCategoryValue(e.target.value)} />
          <datalist id="bulk-cat-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setBulkCategoryOpen(false)}>Cancel</Button><Button className="bg-warning text-warning-foreground hover:bg-warning/90" onClick={bulkChangeCategory}>Apply</Button></div>
        </DialogContent>
      </Dialog>

      {/* Bulk action bar */}
      <BulkActionBar count={selected.size} onClear={clearSelection}>
        <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus("active")}><Power className="h-3.5 w-3.5 mr-1" />Activate</Button>
        <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus("inactive")}><Power className="h-3.5 w-3.5 mr-1" />Deactivate</Button>
        <Button size="sm" variant="outline" onClick={() => setBulkCategoryOpen(true)}><FolderInput className="h-3.5 w-3.5 mr-1" />Category</Button>
        <Button size="sm" variant="outline" className="text-danger border-danger/30 hover:bg-danger/10" onClick={() => setConfirmBulkDelete(true)}><Trash2 className="h-3.5 w-3.5 mr-1" />Delete</Button>
      </BulkActionBar>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-md bg-surface-2 p-2">
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="text-sm font-semibold text-text-primary">{value}</p>
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
        <tr><th className="px-2 py-2 text-left">Variant</th><th className="px-2 py-2 text-left">SKU</th><th className="px-2 py-2 text-left">Price</th><th className="px-2 py-2 text-left">Stock</th><th className="px-2 py-2 text-left">Status</th></tr>
      </thead>
      <tbody>
        {rows.map((v, i) => (
          <tr key={v.id ?? i} className="border-t border-border">
            <td className="px-2 py-1">{[v.option1_value, v.option2_value].filter(Boolean).join(" / ") || "—"}</td>
            <td className="px-2 py-1 font-mono">{v.sku}</td>
            <td className="px-2 py-1">₹{v.price}</td><td className="px-2 py-1">{v.stock}</td>
            <td className="px-2 py-1 capitalize">{v.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
