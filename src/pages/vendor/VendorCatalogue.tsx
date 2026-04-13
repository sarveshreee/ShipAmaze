import { PageHeader } from "@/components/PageHeader";
import { useProducts } from "@/hooks/useSupabaseData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/EmptyState";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Upload, Search, Package, Pencil, Trash2, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { downloadCSV } from "@/lib/exportUtils";

interface ProductForm {
  name: string; sku: string; category: string; weight: string;
  price: string; sellingPrice: string; stock: string; hsn: string; dimensions: string;
}

const emptyForm: ProductForm = { name: "", sku: "", category: "", weight: "", price: "", sellingPrice: "", stock: "", hsn: "", dimensions: "" };

export default function VendorCatalogue() {
  const [search, setSearch] = useState("");
  const { data: products = [], isLoading, refetch } = useProducts();
  const { userId } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));

  const openAdd = () => { setEditId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (p: typeof products[0]) => {
    setEditId(p.id);
    setForm({ name: p.name, sku: p.sku, category: p.category, weight: p.weight, price: String(p.price), sellingPrice: String(p.sellingPrice), stock: String(p.stock), hsn: p.hsn, dimensions: p.dimensions });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) { toast.error("Product name is required"); return; }
    setSaving(true);
    try {
      const data = {
        name: form.name, sku: form.sku || null, category: form.category || null,
        weight: form.weight || null, price: parseFloat(form.price) || 0,
        selling_price: parseFloat(form.sellingPrice) || 0, stock: parseInt(form.stock) || 0,
        hsn: form.hsn || null, dimensions: form.dimensions || null,
        user_id: userId || null,
      };

      if (editId) {
        const { error } = await supabase.from("products").update(data).eq("id", editId);
        if (error) throw error;
        toast.success("Product updated");
      } else {
        const { error } = await supabase.from("products").insert(data);
        if (error) throw error;
        toast.success("Product added");
      }
      setDialogOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      toast.success(`${name} deleted`);
      refetch();
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    }
  };

  const handleExport = () => {
    downloadCSV("products_export",
      ["Name", "SKU", "Category", "Weight", "Price", "Selling Price", "Stock", "HSN"],
      filtered.map(p => [p.name, p.sku, p.category, p.weight, p.price, p.sellingPrice, p.stock, p.hsn])
    );
    toast.success(`Exported ${filtered.length} products`);
  };

  if (isLoading) return <div className="animate-pulse p-8 text-text-muted">Loading products...</div>;

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Catalogue" breadcrumb={["Vendor", "Catalogue"]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport}><Download className="h-4 w-4 mr-2" />Export</Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary-dark" onClick={openAdd}>
              <Plus className="h-4 w-4 mr-2" />Add Product
            </Button>
          </div>
        }
      />
      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input placeholder="Search products..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={Package} title="No products found" description="Try adjusting your search or add a new product" actionLabel="Add Product" onAction={openAdd} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => (
            <div key={p.id} className="rounded-lg bg-card shadow-card p-4">
              <div className="flex h-32 items-center justify-center rounded-md bg-surface-2 mb-3">
                <Package className="h-10 w-10 text-text-muted" />
              </div>
              <h3 className="font-semibold text-text-primary truncate">{p.name}</h3>
              <p className="text-xs font-mono text-text-muted mt-0.5">{p.sku}</p>
              <div className="flex items-center justify-between mt-2">
                <p className="text-lg font-bold text-primary">₹{p.sellingPrice}</p>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", p.stock > 0 ? "bg-success-light text-success-dark" : "bg-danger-light text-danger-dark")}>
                  {p.stock > 0 ? `${p.stock} in stock` : "Out of stock"}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(p)}>
                  <Pencil className="h-3 w-3 mr-1" />Edit
                </Button>
                <Button variant="outline" size="sm" className="text-danger" onClick={() => handleDelete(p.id, p.name)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Name *</Label><Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Cotton T-Shirt" /></div>
            <div><Label>SKU</Label><Input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} placeholder="SKU-001" /></div>
            <div><Label>Category</Label><Input value={form.category} onChange={e => setForm({...form, category: e.target.value})} placeholder="Apparel" /></div>
            <div><Label>Price (₹)</Label><Input type="number" value={form.price} onChange={e => setForm({...form, price: e.target.value})} placeholder="499" /></div>
            <div><Label>Selling Price (₹)</Label><Input type="number" value={form.sellingPrice} onChange={e => setForm({...form, sellingPrice: e.target.value})} placeholder="399" /></div>
            <div><Label>Stock</Label><Input type="number" value={form.stock} onChange={e => setForm({...form, stock: e.target.value})} placeholder="100" /></div>
            <div><Label>Weight</Label><Input value={form.weight} onChange={e => setForm({...form, weight: e.target.value})} placeholder="0.5 kg" /></div>
            <div><Label>HSN Code</Label><Input value={form.hsn} onChange={e => setForm({...form, hsn: e.target.value})} placeholder="6100" /></div>
            <div><Label>Dimensions</Label><Input value={form.dimensions} onChange={e => setForm({...form, dimensions: e.target.value})} placeholder="10x8x5 cm" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-primary text-primary-foreground">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{editId ? "Update" : "Add"} Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


