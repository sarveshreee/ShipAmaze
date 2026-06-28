import { useCallback, useEffect, useState } from "react";
import * as categoryService from "@/services/categoryService";
import type { CategoryRow } from "@/services/categoryService";

let cached: CategoryRow[] | null = null;
let cacheTs = 0;
const pending = new Map<string, Promise<CategoryRow[]>>();
const CACHE_MS = 60_000;

export function useCategories(options?: { all?: boolean; enabledOnly?: boolean }) {
  const [categories, setCategories] = useState<CategoryRow[]>(cached ?? []);
  const [loading, setLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now = Date.now();
      if (!options?.all && cached && now - cacheTs < CACHE_MS) {
        setCategories(cached);
        return cached;
      }
      const requestKey = options?.all === true ? "all" : "enabled";
      if (!pending.has(requestKey)) {
        pending.set(
          requestKey,
          categoryService.listCategories(options?.all === true).finally(() => {
            pending.delete(requestKey);
          })
        );
      }
      const rows = await pending.get(requestKey)!;
      const list = Array.isArray(rows) ? rows : [];
      const filtered = options?.enabledOnly === false ? list : list.filter((c) => c.enabled !== false);
      if (!options?.all) {
        cached = filtered;
        cacheTs = now;
      }
      setCategories(filtered);
      return filtered;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load categories");
      setCategories([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [options?.all, options?.enabledOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  return { categories, loading, error, refetch: load };
}

export function hsnForCategoryName(categories: CategoryRow[], categoryName?: string | null): string {
  if (!categoryName) return "";
  const hit = categories.find((c) => c.name === categoryName || c.slug === categoryName);
  return hit?.defaultHsn ?? "";
}

export function invalidateCategoryCache() {
  cached = null;
  cacheTs = 0;
  pending.clear();
}
