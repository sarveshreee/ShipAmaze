import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Package, Eye, ShoppingBag, AlertCircle } from "lucide-react";
import { useMarketplaceProducts } from "@/hooks/useMarketplace";
import { getFinalProductPrice, formatProductPriceInr } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export default function DropshipperCatalog() {
  const navigate = useNavigate();
  const { products, categories, isLoading, refetch } = useMarketplaceProducts();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [view, setView] = useState<"grid" | "table">("grid");

  const filtered = useMemo(() => {
    let list = products;
    if (category !== "all") list = list.filter((p) => (p.category || "Other") === category);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.category ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, search, category]);

  return (
    <div className="animate-fade-in-up space-y-4">
      <PageHeader title="Catalog" breadcrumb={["Dropshipper", "Catalog"]} />

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <Input
            placeholder="Search by name, SKU, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full lg:w-[200px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant={view === "grid" ? "default" : "outline"} size="sm" onClick={() => setView("grid")}>Grid</Button>
          <Button variant={view === "table" ? "default" : "outline"} size="sm" onClick={() => setView("table")}>Table</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <AlertCircle className="h-10 w-10 text-text-muted mx-auto mb-3" />
          <p className="font-medium text-text-primary">No products found</p>
          <p className="text-sm text-text-muted mt-1">Try adjusting search or filters. Only admin-approved live catalog is shown.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void refetch()}>Refresh</Button>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="rounded-xl border border-border bg-card overflow-hidden shadow-card flex flex-col">
              <div className="aspect-square bg-muted relative">
                <img src={p.images[0] || "/placeholder.svg"} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
                <Badge className="absolute top-2 left-2 text-[10px]" variant="secondary">{p.sku || "—"}</Badge>
              </div>
              <div className="p-3 flex flex-col flex-1">
                <p className="text-sm font-semibold line-clamp-2 text-text-primary">{p.name}</p>
                <p className="text-lg font-bold text-primary mt-1">{formatProductPriceInr(getFinalProductPrice(p))}</p>
                <p className="text-[11px] text-text-muted mt-0.5">Cost + shipping · {p.category || "General"}</p>
                <div className="flex items-center gap-2 mt-2 text-xs text-text-muted">
                  <Package className="h-3 w-3" /> Stock: {p.stock}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 mt-auto pt-2">
                  <Button size="sm" variant="outline" className="h-8 text-xs" asChild>
                    <Link to={`/dropshipper/home/product/${p.id}`}><Eye className="h-3 w-3 mr-1" />View</Link>
                  </Button>
                  <Button size="sm" className="h-8 text-xs" onClick={() => navigate(`/dropshipper/create-order?product=${p.id}`)}>
                    <ShoppingBag className="h-3 w-3 mr-1" />Sell
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto bg-card">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-border bg-surface-2/50">
                <th className="p-3 text-left">Product</th>
                <th className="p-3 text-left">SKU</th>
                <th className="p-3 text-left">Category</th>
                <th className="p-3 text-right">Final price</th>
                <th className="p-3 text-right">Stock</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-surface-2/30">
                  <td className="p-3 font-medium max-w-[200px] truncate">{p.name}</td>
                  <td className="p-3 font-mono text-xs">{p.sku || "—"}</td>
                  <td className="p-3 text-text-secondary">{p.category || "—"}</td>
                  <td className="p-3 text-right font-semibold tabular-nums">{formatProductPriceInr(getFinalProductPrice(p))}</td>
                  <td className="p-3 text-right tabular-nums">{p.stock}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="ghost" className="h-8" asChild>
                      <Link to={`/dropshipper/home/product/${p.id}`}>Details</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={cn("text-xs text-text-muted")}>
        Prices shown include product cost plus shipping. Pending vendor price changes are not visible until admin approval.
      </p>
    </div>
  );
}
