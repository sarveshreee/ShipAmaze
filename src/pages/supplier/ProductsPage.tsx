import { useMemo, useState } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionBar } from "@/components/BulkActionBar";
import { downloadCSV } from "@/lib/exportUtils";

export default function ProductsPage() {
  const navigate = useNavigate();
  const { role, isDemoMode, userId } = useAuth();
  const { data, isLoading, refetch } = useSupplierProducts();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [pageSize, setPageSize] = useState(12);
  const [page, setPage] = useState(1);
  const [variantsFor, setVariantsFor] = useState<SupplierProduct | null>(null);
  const [detailsFor, setDetailsFor] = useState<SupplierProduct | null>(null);
  const [priceReqFor, setPriceReqFor] = useState<SupplierProduct | null>(null);
  const [priceMsg, setPriceMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<SupplierProduct | null>(null);

  const categories = useMemo(() => Array.from(new Set(data.map(p => p.category).filter(Boolean))), [data]);

  const filtered = useMemo(() => {
    let arr = data.filter(p => {
      const q = search.toLowerCase();
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.status.includes(q);
      const matchCat = categoryFilter === "all" || p.category === categoryFilter;
      const matchStatus = statusFilter === "all" || p.status === statusFilter;
      return matchSearch && matchCat && matchStatus;
    });
    if (sortBy === "newest") arr = [...arr].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    if (sortBy === "oldest") arr = [...arr].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
    if (sortBy === "price-asc") arr = [...arr].sort((a, b) => a.selling_price - b.selling_price);
    if (sortBy === "price-desc") arr = [...arr].sort((a, b) => b.selling_price - a.selling_price);
    if (sortBy === "name") arr = [...arr].sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [data, search, categoryFilter, statusFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageData = filtered.slice((page - 1) * pageSize, page * pageSize);

  const counts = useMemo(() => ({
    total: data.length,
    active: data.filter(p => p.status === "active").length,
    draft: data.filter(p => p.status === "draft").length,
    inactive: data.filter(p => p.status === "inactive").length,
  }), [data]);

  const resetFilters = () => { setSearch(""); setCategoryFilter("all"); setStatusFilter("all"); setSortBy("newest"); setPage(1); };

  const updateStatus = async (p: SupplierProduct, status: SupplierProduct["status"]) => {
    if (isDemoMode) {
      const stored = localStorage.getItem("supplier_products_demo");
      const list = stored ? JSON.parse(stored) : [];
      const i = list.findIndex((x: any) => x.id === p.id);
      if (i >= 0) { list[i].status = status; localStorage.setItem("supplier_products_demo", JSON.stringify(list)); }
      toast.success(`${p.name} → ${status}`);
      refetch();
      return;
    }
    const { error } = await supabase.from("products").update({ status }).eq("id", p.id);
    if (error) toast.error(error.message); else { toast.success(`${p.name} → ${status}`); refetch(); }
  };

  const duplicate = async (p: SupplierProduct) => {
    const { id, created_at, updated_at, sku, ...rest } = p as any;
    const payload = { ...rest, sku: `${sku || "SKU"}-COPY`, name: `${p.name} (Copy)`, status: "draft", user_id: userId };
    if (isDemoMode) {
      const stored = localStorage.getItem("supplier_products_demo");
      const list = stored ? JSON.parse(stored) : [];
      list.unshift({ ...payload, id: `demo-${Date.now()}`, created_at: new Date().toISOString() });
      localStorage.setItem("supplier_products_demo", JSON.stringify(list));
      toast.success("Duplicated");
      refetch();
      return;
    }
    const { error } = await supabase.from("products").insert(payload);
    if (error) toast.error(error.message); else { toast.success("Duplicated"); refetch(); }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const p = confirmDelete;
    if (isDemoMode) {
      const stored = localStorage.getItem("supplier_products_demo");
      const list = stored ? JSON.parse(stored) : [];
      localStorage.setItem("supplier_products_demo", JSON.stringify(list.filter((x: any) => x.id !== p.id)));
      toast.success("Deleted");
    } else {
      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Deleted");
    }
    setConfirmDelete(null);
    refetch();
  };

  const submitPriceRequest = async () => {
    if (!priceReqFor || !priceMsg.trim()) { toast.error("Enter your message"); return; }
    const payload = {
      request_id: `PRQ-${Date.now()}`,
      user_id: userId,
      name: `Price request: ${priceReqFor.name}`,
      category: priceReqFor.category,
      proposed_sku: priceReqFor.sku,
      estimated_price: priceReqFor.selling_price,
      description: priceMsg,
      status: "pending",
    };
    if (isDemoMode) {
      const stored = localStorage.getItem("product_requests_demo");
      const list = stored ? JSON.parse(stored) : [];
      list.unshift({ ...payload, id: `demo-${Date.now()}`, created_at: new Date().toISOString(), images: [], compliance_docs: [] });
      localStorage.setItem("product_requests_demo", JSON.stringify(list));
    } else {
      const { error } = await supabase.from("product_requests").insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Price request submitted");
    setPriceReqFor(null); setPriceMsg("");
  };

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="My Products" breadcrumb={[role.charAt(0).toUpperCase() + role.slice(1), "Products"]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate(`/${role}/bulk-upload-products`)}><Upload className="h-4 w-4 mr-2" />Bulk Upload</Button>
            <Button variant="outline" onClick={() => navigate(`/${role}/products?status=trash`)}><Trash2 className="h-4 w-4 mr-2" />Trash</Button>
            <Button className="bg-warning text-warning-foreground hover:bg-warning/90" onClick={() => navigate(`/${role}/source-product`)}>
              <Plus className="h-4 w-4 mr-2" />Add Product
            </Button>
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
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem><SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem><SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
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
            <Button className="bg-warning text-warning-foreground hover:bg-warning/90" onClick={() => navigate(`/${role}/source-product`)}><Plus className="h-4 w-4 mr-1" />Add Product</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {pageData.map(p => {
              const img = p.images[p.primary_image_index] || p.images[0];
              return (
                <div key={p.id} className="group rounded-xl bg-card shadow-card hover:shadow-card-lg transition-shadow overflow-hidden flex flex-col">
                  <div className="relative aspect-square bg-surface-2 flex items-center justify-center">
                    {img ? <img src={img} alt={p.name} className="w-full h-full object-cover" /> : <Package className="h-10 w-10 text-text-muted" />}
                    <div className="absolute top-2 left-2"><ProductStatusBadge status={p.status} /></div>
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { sessionStorage.setItem("product_preview", JSON.stringify({ ...p, tags: p.tags || [], variants: [] })); window.open("/product-preview", "_blank", "noopener"); }} title="Preview" className="h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center hover:bg-primary hover:text-primary-foreground"><Eye className="h-3 w-3" /></button>
                      <button onClick={() => navigate(`/${role}/source-product?id=${p.id}`)} title="Edit" className="h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center hover:bg-primary hover:text-primary-foreground"><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => setConfirmDelete(p)} title="Delete" className="h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center hover:bg-danger hover:text-white"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                  <div className="p-3 flex flex-col flex-1">
                    <h3 className="font-semibold text-sm text-warning-dark truncate">{p.name}</h3>
                    <p className="font-bold text-text-primary mt-1">₹{p.selling_price}</p>
                    <div className="flex items-center justify-between text-xs text-text-muted mt-1">
                      <span className="font-mono">{p.sku || "—"}</span>
                      <span>{p.brand || "Self"}</span>
                    </div>
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
  const { isDemoMode } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useMemo(() => {
    if (!productId) return;
    setLoading(true);
    if (isDemoMode) { setRows([]); setLoading(false); return; }
    supabase.from("product_variants").select("*").eq("product_id", productId).then(({ data }) => { setRows(data || []); setLoading(false); });
  }, [productId, isDemoMode]);

  if (loading) return <p className="text-sm text-text-muted">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-text-muted">No variants for this product.</p>;
  return (
    <table className="w-full text-xs">
      <thead className="bg-surface-2 text-text-muted uppercase tracking-wide">
        <tr><th className="px-2 py-2 text-left">Variant</th><th className="px-2 py-2 text-left">SKU</th><th className="px-2 py-2 text-left">Price</th><th className="px-2 py-2 text-left">Stock</th><th className="px-2 py-2 text-left">Status</th></tr>
      </thead>
      <tbody>
        {rows.map(v => (
          <tr key={v.id} className="border-t border-border">
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
