import type { CategoryRow } from "@/services/categoryService";

/** Strip emoji / pictographs and normalize for fuzzy category matching. */
export function normalizeCategoryKey(value: string): string {
  return value
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function keysMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.toLowerCase() === b.toLowerCase()) return true;
  return normalizeCategoryKey(a) === normalizeCategoryKey(b);
}

/** Map a product's raw category (name, slug, or legacy label) to the admin category display name. */
export function resolveCategoryName(raw: string, rows: CategoryRow[]): string {
  const trimmed = raw.trim();
  if (!trimmed) return "Other";

  for (const c of rows) {
    if (keysMatch(trimmed, c.name) || keysMatch(trimmed, c.slug)) {
      return c.name;
    }
  }

  return trimmed;
}

export function findCategoryByNameOrSlug(
  value: string,
  rows: CategoryRow[]
): CategoryRow | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return rows.find((c) => keysMatch(trimmed, c.name) || keysMatch(trimmed, c.slug));
}

export function categoryHasProducts(
  categoryName: string,
  grouped: Map<string, unknown[]>,
  rows: CategoryRow[]
): boolean {
  if ((grouped.get(categoryName)?.length ?? 0) > 0) return true;

  const row = rows.find((c) => c.name === categoryName);
  if (!row) return false;

  for (const [key, items] of grouped) {
    if (!items.length) continue;
    if (keysMatch(key, row.name) || keysMatch(key, row.slug)) return true;
    if (resolveCategoryName(key, rows) === row.name) return true;
  }
  return false;
}
