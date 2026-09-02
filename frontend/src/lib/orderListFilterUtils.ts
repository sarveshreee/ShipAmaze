import type { OrderListFilterValues, OrderSearchField } from "@/services/orderService";

export const ORDER_SEARCH_FIELD_OPTIONS: { value: OrderSearchField; label: string }[] = [
  { value: "trackingId", label: "Tracking ID" },
  { value: "orderId", label: "Order ID" },
  { value: "invoiceNumber", label: "Invoice Number" },
  { value: "channelOrderNumber", label: "Channel Order Number" },
  { value: "productName", label: "Product Name" },
  { value: "productSku", label: "Product SKU" },
  { value: "consigneeName", label: "Consignee Name" },
  { value: "consigneeMobile", label: "Consignee Mobile" },
  { value: "consigneeEmail", label: "Consignee Email" },
];

export function searchFieldLabel(field: OrderSearchField | undefined): string {
  if (!field) return "Search field";
  return ORDER_SEARCH_FIELD_OPTIONS.find((o) => o.value === field)?.label ?? field;
}

export function csvToList(v: string | undefined): string[] {
  if (!v?.trim()) return [];
  return [
    ...new Set(
      v
        .split(/[,|\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];
}

export function listToCsv(values: Iterable<string>): string {
  return [...values].filter(Boolean).join(",");
}

export function hasActiveListFilters(f: OrderListFilterValues, extras?: { q?: string }): boolean {
  if (extras?.q?.trim()) return true;
  return Object.entries(f).some(([, v]) => v != null && String(v).trim() !== "" && v !== "choose");
}

export type FilterTag = { id: string; label: string; onRemove: () => void };

export function buildOrderFilterTags(
  filters: OrderListFilterValues,
  ctx: {
    onPatch: (patch: Partial<OrderListFilterValues>) => void;
    onRemoveSearch?: () => void;
    searchQ?: string;
    channelPayment?: string;
    channelFulfillment?: string;
    activeTab?: string;
    dropshipperLabel?: (id: string) => string;
    vendorLabel?: (id: string) => string;
    serviceabilityLabel?: string;
    onRemoveServiceability?: () => void;
    onRemoveChannelPayment?: () => void;
    onRemoveChannelFulfillment?: () => void;
  }
): FilterTag[] {
  const tags: FilterTag[] = [];
  const patch = ctx.onPatch;

  const addSimple = (id: keyof OrderListFilterValues, label: string) => {
    const v = filters[id];
    if (v == null || String(v).trim() === "" || v === "choose") return;
    tags.push({
      id: String(id),
      label,
      onRemove: () => patch({ [id]: undefined }),
    });
  };

  if (ctx.searchQ?.trim()) {
    tags.push({
      id: "__q",
      label: `Search: ${ctx.searchQ.trim()}`,
      onRemove: () => ctx.onRemoveSearch?.(),
    });
  }

  if (filters.searchField && filters.searchValue?.trim()) {
    const preview = filters.searchValue.trim().split(/\n|,/)[0]?.slice(0, 40) ?? "";
    tags.push({
      id: "__fieldSearch",
      label: `${searchFieldLabel(filters.searchField)}: ${preview}${filters.searchValue.trim().length > preview.length ? "…" : ""}`,
      onRemove: () => patch({ searchField: undefined, searchValue: undefined }),
    });
  }

  addSimple("status", `Shipment Status: ${filters.status}`);
  if (ctx.activeTab !== "channel") addSimple("payment", `Payment: ${filters.payment}`);
  addSimple("courier", `Courier: ${filters.courier}`);

  for (const name of csvToList(filters.couriers)) {
    tags.push({
      id: `courier:${name}`,
      label: `Courier: ${name}`,
      onRemove: () => {
        const next = csvToList(filters.couriers).filter((c) => c !== name);
        patch({ couriers: next.length ? listToCsv(next) : undefined });
      },
    });
  }

  for (const store of csvToList(filters.store)) {
    tags.push({
      id: `store:${store}`,
      label: `Store: ${store}`,
      onRemove: () => {
        const next = csvToList(filters.store).filter((s) => s !== store);
        patch({ store: next.length ? listToCsv(next) : undefined });
      },
    });
  }

  for (const sku of csvToList(filters.productSkus ?? filters.productSku)) {
    tags.push({
      id: `sku:${sku}`,
      label: `SKU: ${sku}`,
      onRemove: () => {
        const fromMulti = csvToList(filters.productSkus);
        if (fromMulti.length > 0) {
          const next = fromMulti.filter((s) => s !== sku);
          patch({
            productSkus: next.length ? listToCsv(next) : undefined,
            productSku: undefined,
          });
        } else {
          patch({ productSku: undefined });
        }
      },
    });
  }

  for (const name of csvToList(filters.productNames)) {
    tags.push({
      id: `product:${name}`,
      label: `Product: ${name}`,
      onRemove: () => {
        const next = csvToList(filters.productNames).filter((n) => n !== name);
        patch({ productNames: next.length ? listToCsv(next) : undefined });
      },
    });
  }

  addSimple("source", `Source: ${filters.source}`);
  addSimple("dateFrom", `From: ${filters.dateFrom}`);
  addSimple("dateTo", `To: ${filters.dateTo}`);
  if (filters.dateType?.trim() && filters.dateType !== "choose") {
    const label =
      filters.dateType === "pickup"
        ? "Pickup"
        : filters.dateType === "delivered"
          ? "Delivered"
          : filters.dateType === "placed"
            ? "Placed"
            : filters.dateType;
    tags.push({
      id: "dateType",
      label: `Date type: ${label}`,
      onRemove: () => patch({ dateType: undefined }),
    });
  }
  addSimple("customerCity", `Customer city: ${filters.customerCity}`);
  addSimple("customerState", `Customer state: ${filters.customerState}`);
  addSimple("customerName", `Customer: ${filters.customerName}`);
  addSimple("pickupCity", `Pickup city: ${filters.pickupCity}`);
  addSimple("pickupState", `Pickup state: ${filters.pickupState}`);
  addSimple("amountMin", `Min ₹: ${filters.amountMin}`);
  addSimple("amountMax", `Max ₹: ${filters.amountMax}`);
  addSimple("remark", `Remark: ${filters.remark}`);

  if (filters.remarkHas === "yes") {
    tags.push({ id: "remarkHas", label: "Remark: Has remark", onRemove: () => patch({ remarkHas: undefined }) });
  } else if (filters.remarkHas === "no") {
    tags.push({ id: "remarkHas", label: "Remark: No remark", onRemove: () => patch({ remarkHas: undefined }) });
  }

  if (filters.pickupMissing === "yes") {
    tags.push({ id: "pickupMissing", label: "Pickup: Missing", onRemove: () => patch({ pickupMissing: undefined }) });
  }
  if (filters.pickupValidPincode === "yes") {
    tags.push({
      id: "pickupValidPincode",
      label: "Pickup: Valid pincode",
      onRemove: () => patch({ pickupValidPincode: undefined }),
    });
  } else if (filters.pickupValidPincode === "no") {
    tags.push({
      id: "pickupValidPincode",
      label: "Pickup: Invalid pincode",
      onRemove: () => patch({ pickupValidPincode: undefined }),
    });
  }
  if (filters.pickupVelocityLinked === "yes") {
    tags.push({
      id: "pickupVelocityLinked",
      label: "Pickup: Velocity linked",
      onRemove: () => patch({ pickupVelocityLinked: undefined }),
    });
  }
  if (filters.pickupVelocityUnlinked === "yes") {
    tags.push({
      id: "pickupVelocityUnlinked",
      label: "Pickup: Not Velocity linked",
      onRemove: () => patch({ pickupVelocityUnlinked: undefined }),
    });
  }

  for (const key of csvToList(filters.pickupKeys)) {
    tags.push({
      id: `pickup:${key}`,
      label: `Pickup: ${key === "__unassigned__" ? "Unassigned" : key}`,
      onRemove: () => {
        const next = csvToList(filters.pickupKeys).filter((k) => k !== key);
        patch({ pickupKeys: next.length ? listToCsv(next) : undefined });
      },
    });
  }

  if (filters.hasAwb === "yes" || filters.hasAwb === "no") {
    tags.push({
      id: "hasAwb",
      label: `AWB: ${filters.hasAwb === "yes" ? "Yes" : "No"}`,
      onRemove: () => patch({ hasAwb: undefined }),
    });
  }
  if (filters.shipmentCreated === "yes" || filters.shipmentCreated === "no") {
    tags.push({
      id: "shipmentCreated",
      label: `Shipment: ${filters.shipmentCreated === "yes" ? "Created" : "Not created"}`,
      onRemove: () => patch({ shipmentCreated: undefined }),
    });
  }
  if (filters.dropshipperId?.trim()) {
    const label = ctx.dropshipperLabel?.(filters.dropshipperId) ?? filters.dropshipperId;
    tags.push({
      id: "dropshipperId",
      label: `Dropshipper: ${label}`,
      onRemove: () => patch({ dropshipperId: undefined }),
    });
  }
  if (filters.vendorId?.trim()) {
    const label = ctx.vendorLabel?.(filters.vendorId) ?? filters.vendorId;
    tags.push({
      id: "vendorId",
      label: `Vendor: ${label}`,
      onRemove: () => patch({ vendorId: undefined }),
    });
  }
  if (ctx.activeTab === "channel" && ctx.channelPayment?.trim()) {
    tags.push({
      id: "__chPay",
      label: `Payment: ${ctx.channelPayment}`,
      onRemove: () => ctx.onRemoveChannelPayment?.(),
    });
  }
  if (ctx.activeTab === "channel" && ctx.channelFulfillment?.trim()) {
    tags.push({
      id: "__chFul",
      label: `Fulfillment: ${ctx.channelFulfillment}`,
      onRemove: () => ctx.onRemoveChannelFulfillment?.(),
    });
  }
  if (ctx.serviceabilityLabel && ctx.onRemoveServiceability) {
    tags.push({
      id: "__svcCourier",
      label: ctx.serviceabilityLabel,
      onRemove: ctx.onRemoveServiceability,
    });
  }

  return tags;
}
