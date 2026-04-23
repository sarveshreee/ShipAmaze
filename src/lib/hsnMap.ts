// Default category → HSN mapping. Extend or wire to backend later.
export const CATEGORY_HSN_MAP: Record<string, string> = {
  Apparel: "6109",
  Electronics: "8517",
  "Home & Kitchen": "7323",
  "Home and Living": "7323",
  Beauty: "3304",
  "Beauty & Personal Care": "3304",
  Sports: "9506",
  Toys: "9503",
  Books: "4901",
  Automotive: "8708",
  "Car & Bike Accessories": "8708",
  "Arts & Entertainment": "9701",
};

export function hsnForCategory(category?: string | null): string {
  if (!category) return "";
  return CATEGORY_HSN_MAP[category] || "";
}
