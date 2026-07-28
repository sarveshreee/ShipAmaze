/**
 * Barcode / scan value priority for shipping labels and order lookup.
 * When multiple barcodes are present on a label, prefer AWB → Tracking → Order ID.
 */

export type BarcodeKind = "awb" | "tracking" | "orderId" | "unknown";

export type RankedBarcode = {
  value: string;
  kind: BarcodeKind;
  rank: number; // lower = higher priority
};

const ORDER_ID_HINT =
  /^(SA[-_]?|ORD[-_]?|ORDER[-_]?|SHOPIFY[-_]?|#|#?\d{4,}[-_])/i;

/** Heuristic classification of a single scanned / decoded value. */
export function classifyBarcodeValue(raw: string): BarcodeKind {
  const v = String(raw ?? "").trim();
  if (!v) return "unknown";
  if (ORDER_ID_HINT.test(v)) return "orderId";
  // Typical phone / amount noise on labels — ignore for AWB priority
  if (/^\d{10}$/.test(v)) return "unknown";
  if (/^\d{1,6}(\.\d+)?$/.test(v)) return "unknown";
  // Courier AWB/tracking style (alphanumeric, optional hyphens)
  if (/^[A-Z0-9][A-Z0-9-]{6,35}$/i.test(v)) return "awb";
  if (/^[A-Z0-9-]{6,40}$/i.test(v)) return "tracking";
  return "unknown";
}

function rankForKind(kind: BarcodeKind): number {
  switch (kind) {
    case "awb":
      return 1;
    case "tracking":
      return 2;
    case "orderId":
      return 3;
    default:
      return 9;
  }
}

/**
 * Pick the best barcode when a scanner/camera returns multiple values.
 * Priority: AWB → Tracking → Order ID → other.
 * Callers may pass `{ value, kind }` to force classification (e.g. labeled barcode slots).
 */
export function preferBarcodeValue(
  values: Array<string | null | undefined | { value: string; kind?: BarcodeKind }>
): string {
  const ranked: RankedBarcode[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = typeof raw === "string" || raw == null ? String(raw ?? "").trim() : String(raw.value ?? "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const kind =
      typeof raw === "object" && raw && raw.kind
        ? raw.kind
        : classifyBarcodeValue(value);
    ranked.push({ value, kind, rank: rankForKind(kind) });
  }
  ranked.sort((a, b) => a.rank - b.rank || b.value.length - a.value.length);
  return ranked[0]?.value ?? "";
}

/** Build ordered candidates for Mongo $or — AWB/tracking exact before orderId. */
export function scanLookupClauses(search: string): Record<string, unknown>[] {
  const trimmed = String(search ?? "").trim();
  if (!trimmed) return [];
  const upper = trimmed.toUpperCase();
  return [
    { awb: trimmed },
    { awb: upper },
    { trackingId: trimmed },
    { trackingId: upper },
    { velocityShipmentId: trimmed },
    { shipmentId: trimmed },
    { orderId: trimmed },
    { orderId: upper },
    { externalOrderName: trimmed },
  ];
}
