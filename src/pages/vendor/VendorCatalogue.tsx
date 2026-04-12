import { PageHeader } from "@/components/PageHeader";
import { useProducts } from "@/hooks/useSupabaseData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { Plus, Upload, Search, Package, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export default function VendorCatalogue() {
  const [search, setSearch] = useState("");
  const { data: products = [], isLoading } = useProducts();
  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()));

  if (isLoading) return <div className="animate-pulse p-8 text-text-muted">Loading products...</div>;

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Catalogue" breadcrumb={["Vendor", "Catalogue"]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => toast.info("CSV import coming soon")}>
              <Upload className="h-4 w-4 mr-2" />Import CSV
            </Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary-dark" onClick={() => toast.info("Add product form coming soon")}>
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
        <EmptyState icon={Package} title="No products found" description="Try adjusting your search or add a new product" actionLabel="Add Product" onAction={() => toast.info("Add product form coming soon")} />
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
                <span className="rounded-full bg-success-light px-2 py-0.5 text-xs font-medium text-success-dark">{p.stock} in stock</span>
              </div>
              <div className="flex gap-2 mt-3">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => toast.info(`Editing ${p.name}`)}>
                  <Pencil className="h-3 w-3 mr-1" />Edit
                </Button>
                <Button variant="outline" size="sm" className="text-danger" onClick={() => toast.error(`${p.name} deleted`)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
