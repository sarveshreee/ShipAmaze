import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, ChevronLeft, ChevronRight, Truck, Wallet, Users } from "lucide-react";
import { ShipAmazeLogo } from "@/components/brand/ShipAmazeLogo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useMarketplaceProducts } from "@/hooks/useMarketplace";
import { MarketplaceProductCard } from "@/components/marketplace/MarketplaceProductCard";
import { ProfitCalculatorModal } from "@/components/marketplace/ProfitCalculatorModal";
import { ShopifyPushDrawer } from "@/components/marketplace/ShopifyPushDrawer";
import type { SupplierProduct } from "@/hooks/useSupplierProducts";

const INITIAL_SECTION_COUNT = 6;
const PRODUCTS_PER_SECTION = 12;
const SEARCH_RESULT_LIMIT = 48;

export default function MarketplaceHome() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const { products, grouped, categories, categoryRows, isLoading, categoriesLoading } = useMarketplaceProducts();
  const [search, setSearch] = useState("");
  const [visibleSectionCount, setVisibleSectionCount] = useState(INITIAL_SECTION_COUNT);
  const [calc, setCalc] = useState<SupplierProduct | null>(null);
  const [push, setPush] = useState<SupplierProduct | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const sectionsOrder = useMemo(() => {
    const live = Array.from(grouped.keys());
    const liveSet = new Set(live);
    // Use admin-configured displayOrder from the Categories API
    const ordered = categoryRows
      .filter(c => c.enabled !== false)
      .sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999))
      .map(c => c.name)
      .filter(name => liveSet.has(name));
    const orderedSet = new Set(ordered);
    // Append any live categories not in admin list
    return [...ordered, ...live.filter(c => !orderedSet.has(c))];
  }, [grouped, categoryRows]);
  const visibleSections = sectionsOrder.slice(0, visibleSectionCount);

  const filtered = useMemo(() => {
    if (!deferredSearch) return null;
    return products
      .filter(p => p.name.toLowerCase().includes(deferredSearch) || p.sku.toLowerCase().includes(deferredSearch) || p.category.toLowerCase().includes(deferredSearch))
      .slice(0, SEARCH_RESULT_LIMIT);
  }, [deferredSearch, products]);

  const scrollSection = (id: string, dir: 1 | -1) => {
    const el = sectionRefs.current[id];
    if (el) el.scrollBy({ left: dir * 600, behavior: "smooth" });
  };

  const jumpToCategory = (cat: string) => {
    const el = document.getElementById(`cat-${cat}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-6 -mt-4 lg:-mt-6 -mx-4 lg:-mx-6 p-4 lg:p-6 bg-gradient-to-b from-primary/5 to-background min-h-full">
      {/* Marketplace top bar */}
      <div className="flex flex-wrap items-center gap-3 bg-card rounded-xl border p-3">
        <Link to={`/${role}/home`} className="flex items-center gap-2 shrink-0">
          <ShipAmazeLogo placement="marketplace" />
          <span className="hidden sm:inline text-xs font-normal text-muted-foreground border-l pl-2 ml-1">B2B Marketplace</span>
        </Link>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products, SKU, categories..." className="pl-9 bg-muted/40" />
        </div>
      </div>

      {/* Hero banner */}
      <div className="rounded-2xl bg-gradient-to-r from-primary/15 via-primary/10 to-purple-200/30 p-6 md:p-8 border">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-primary font-semibold mb-1">Powered partners</p>
            <h1 className="text-2xl md:text-3xl font-bold">Discover • Source • Sell • Scale</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">India's fastest-growing dropshipping marketplace — verified suppliers, real-time inventory, daily payouts.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { icon: Truck, label: "Fast Nationwide Delivery" },
              { icon: Users, label: "Reliable Supplier Network" },
              { icon: Wallet, label: "Daily Payouts" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 bg-background/70 backdrop-blur rounded-xl px-3 py-2 border text-xs font-medium">
                <Icon className="h-4 w-4 text-primary" /> {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Category circles */}
      <div className="flex gap-4 overflow-x-auto scrollbar-thin pb-2">
        {categories.map(c => (
          <button key={c.slug} onClick={() => jumpToCategory(c.name)} className="group shrink-0 flex flex-col items-center w-20">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-primary/30 flex items-center justify-center text-2xl group-hover:scale-105 transition">{c.emoji}</div>
            <span className="text-xs text-center mt-2 line-clamp-2">{c.name}</span>
          </button>
        ))}
      </div>

      {/* Search results */}
      {filtered && (
        <section>
          <h2 className="text-lg font-bold mb-3">Search results ({filtered.length})</h2>
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No products match your search.</p>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-3">
              {filtered.map((p, index) => <MarketplaceProductCard key={p.id} product={p} onCalculator={setCalc} onPush={setPush} priority={index < 4} />)}
            </div>
          )}
        </section>
      )}

      {/* Featured */}
      {!filtered && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">🔥 Extreme Profitable Products</h2>
            <span className="text-xs text-primary font-medium">View all : {products.length}</span>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-thin">
            {products.slice(0, 10).map((p, index) => <MarketplaceProductCard key={p.id} product={p} onCalculator={setCalc} onPush={setPush} priority={index < 4} />)}
          </div>
        </section>
      )}

      {/* Category sections */}
      {!filtered && visibleSections.map(cat => {
        const items = grouped.get(cat) || [];
        if (items.length === 0) return null;
        return (
          <section key={cat} id={`cat-${cat}`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">{cat}</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-primary font-medium">View all : {items.length}</span>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => scrollSection(cat, -1)}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => scrollSection(cat, 1)}><ChevronRight className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            <div ref={el => (sectionRefs.current[cat] = el)} className="flex gap-4 overflow-x-auto pb-3 scrollbar-thin scroll-smooth">
              {items.slice(0, PRODUCTS_PER_SECTION).map(p => <MarketplaceProductCard key={p.id} product={p} onCalculator={setCalc} onPush={setPush} />)}
            </div>
          </section>
        );
      })}
      {!filtered && visibleSectionCount < sectionsOrder.length && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setVisibleSectionCount((count) => count + INITIAL_SECTION_COUNT)}>
            Load more categories
          </Button>
        </div>
      )}

      {isLoading && <p className="text-center py-12 text-muted-foreground text-sm">Loading marketplace...</p>}
      {!isLoading && categoriesLoading && <p className="text-center py-3 text-muted-foreground text-xs">Updating categories...</p>}

      <ProfitCalculatorModal open={!!calc} onOpenChange={(v) => !v && setCalc(null)} product={calc} onPushToShopify={() => { setPush(calc); setCalc(null); }} />
      <ShopifyPushDrawer open={!!push} onOpenChange={(v) => !v && setPush(null)} product={push} />
    </div>
  );
}
