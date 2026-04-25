import { useEffect, useMemo, useState, useCallback } from "react";
import * as productService from "@/services/productService";
import { MARKETPLACE_CATEGORIES } from "@/constants/marketplace";
import { mapApiToSupplierProduct, type SupplierProduct } from "@/hooks/useSupplierProducts";

export function useMarketplaceProducts() {
  const [live, setLive] = useState<SupplierProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  return { products, grouped, featured, isLoading, refetch: load, categories: MARKETPLACE_CATEGORIES };
}

export function useMarketplaceProduct(id: string | undefined) {
  const { products, isLoading } = useMarketplaceProducts();
  const product = useMemo(() => products.find((p) => p.id === id), [products, id]);
  return { product, isLoading };
}
