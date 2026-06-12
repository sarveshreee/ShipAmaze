import { useEffect, useMemo, useState, useCallback } from "react";
import * as productService from "@/services/productService";
import { useCategories } from "@/hooks/useCategories";
import { mapApiToSupplierProduct, type SupplierProduct } from "@/hooks/useSupplierProducts";

export function useMarketplaceProducts() {
  const [live, setLive] = useState<SupplierProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { categories: apiCategories, loading: categoriesLoading } = useCategories();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = (await productService.listMarketplaceProducts()) as unknown as Record<string, unknown>[];
      setLive(rows.map(mapApiToSupplierProduct));
    } catch {
      setLive([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const products = useMemo(() => live, [live]);

  const grouped = useMemo(() => {
    const map = new Map<string, SupplierProduct[]>();
    products.forEach((p) => {
      const k = p.category || "Other";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    });
    return map;
  }, [products]);

  const featured = useMemo(() => products.slice(0, 8), [products]);

  const categories = useMemo(
    () =>
      apiCategories.map((c) => ({
        slug: c.slug,
        name: c.name,
        emoji: c.emoji || "📦",
        imageUrl: c.imageUrl,
      })),
    [apiCategories]
  );

  return { products, grouped, featured, isLoading: isLoading || categoriesLoading, refetch: load, categories };
}

export function useMarketplaceProduct(id: string | undefined) {
  const { products, isLoading } = useMarketplaceProducts();
  const product = useMemo(() => products.find((p) => p.id === id), [products, id]);
  return { product, isLoading };
}
