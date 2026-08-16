/**
 * Canonical product category normalization.
 * Products store denormalized category *names* (not ObjectIds).
 * Dual fields `category` (legacy primary) and `categories` (multi) MUST stay in sync.
 */

export type NormalizedProductCategories = {
  category: string;
  categories: string[];
};

function cleanName(raw: unknown): string {
  return String(raw ?? "").trim();
}

/**
 * Accept either `category`, `categories`, or both from any writer (form, bulk, admin, CSV).
 * Returns synchronized fields. Empty input clears category.
 */
export function normalizeProductCategories(input: {
  category?: unknown;
  categories?: unknown;
}): NormalizedProductCategories {
  const fromArray = Array.isArray(input.categories)
    ? (input.categories as unknown[]).map(cleanName).filter(Boolean)
    : [];
  const fromPrimary = cleanName(input.category);

  let categories: string[];
  if (fromArray.length > 0) {
    // Dedupe preserving order; ensure primary is first if provided
    const seen = new Set<string>();
    categories = [];
    if (fromPrimary && fromArray.includes(fromPrimary)) {
      categories.push(fromPrimary);
      seen.add(fromPrimary);
    }
    for (const c of fromArray) {
      if (seen.has(c)) continue;
      seen.add(c);
      categories.push(c);
    }
    if (fromPrimary && !seen.has(fromPrimary)) {
      categories = [fromPrimary, ...categories];
    }
  } else if (fromPrimary) {
    categories = [fromPrimary];
  } else {
    categories = [];
  }

  return {
    category: categories[0] ?? "",
    categories,
  };
}

/** Apply normalized categories onto a mutable body / document fields. */
export function applyNormalizedCategoriesToBody(
  body: Record<string, unknown>,
  normalized: NormalizedProductCategories
): void {
  if (normalized.categories.length === 0) {
    body.category = "";
    body.categories = [];
    return;
  }
  body.category = normalized.category;
  body.categories = normalized.categories;
}

/**
 * True when the request intends to change category fields.
 */
export function bodyTouchesCategories(body: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(body, "category") ||
    Object.prototype.hasOwnProperty.call(body, "categories")
  );
}
