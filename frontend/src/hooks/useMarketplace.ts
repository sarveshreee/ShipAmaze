import { useEffect, useMemo, useState, useCallback } from "react";
import * as productService from "@/services/productService";
import { useCategories } from "@/hooks/useCategories";
import { resolveCategoryName, categoryHasProducts } from "@/lib/categoryMatch";
import { mapApiToSupplierProduct, type SupplierProduct } from "@/hooks/useSupplierProducts";

let cachedMarketplaceProducts: SupplierProduct[] | null = null;

export function invalidateMarketplaceProductsCache() {
  cachedMarketplaceProducts = null;
}

export function useMarketplaceProducts() {
  const [live, setLive] = useState<SupplierProduct[]>(() => cachedMarketplaceProducts ?? []);
  const [isLoading, setIsLoading] = useState(() => !cachedMarketplaceProducts);
  const { categories: apiCategories, loading: categoriesLoading } = useCategories();

  const load = useCallback(async () => {
    setIsLoading(!cachedMarketplaceProducts);
    try {
      const rows = (await productService.listMarketplaceProducts()) as unknown as Record<string, unknown>[];
      const mapped = rows.map(mapApiToSupplierProduct);
      cachedMarketplaceProducts = mapped;
      setLive(mapped);
    } catch {
      if (!cachedMarketplaceProducts) setLive([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const products = useMemo(() => live, [live]);

  const normalizedProducts = useMemo(
    () =>
      products.map((p) => {
        const resolvedCategories = (p.categories?.length ? p.categories : [p.category])
          .map((c) => resolveCategoryName(c || "", apiCategories))
          .filter(Boolean);
        const unique = [...new Set(resolvedCategories.length ? resolvedCategories : ["Other"])];
        return {
          ...p,
          category: unique[0] || "Other",
          categories: unique,
        };
      }),
    [products, apiCategories]
  );

  /** Group into every assigned category so secondary tags (e.g. Most Delivered) get sections. */
  const grouped = useMemo(() => {
    const map = new Map<string, SupplierProduct[]>();
    normalizedProducts.forEach((p) => {
      const keys = p.categories?.length ? p.categories : [p.category || "Other"];
      const seen = new Set<string>();
      keys.forEach((raw) => {
        const k = raw || "Other";
        if (seen.has(k)) return;
        seen.add(k);
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(p);
      });
    });
    return map;
  }, [normalizedProducts]);

  const featured = useMemo(() => normalizedProducts.slice(0, 8), [normalizedProducts]);

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

  return { products: normalizedProducts, grouped, featured, isLoading, categoriesLoading, refetch: load, categories, categoryRows: apiCategories };
}

export function useMarketplaceProduct(id: string | undefined) {
  const [product, setProduct] = useState<SupplierProduct | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(id));

  useEffect(() => {
    let active = true;
    if (!id) {
      setProduct(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void productService.getProductById(id)
      .then((row) => {
        if (active) setProduct(mapApiToSupplierProduct(row as Record<string, unknown>));
      })
      .catch(() => {
        if (active) setProduct(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  return { product, isLoading };
}
