import mongoose from "mongoose";
import {
  sanitizeForVelocityLog,
  buildVelocityForwardOrchestrationPayload,
} from "./dist/modules/velocity/velocity.payload.js";

const TARGET_ORDER_ID = "shopify-trendbayy-myshopify-com-6454818766907";

function maskPhone(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length <= 4) return "*".repeat(d.length);
  return "*".repeat(d.length - 4) + d.slice(-4);
}

function maskEmail(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (!s.includes("@")) return "***";
  const [local, domain] = s.split("@");
  const mLocal = local.length <= 2 ? "*" : `${local.slice(0, 1)}***${local.slice(-1)}`;
  return `${mLocal}@${domain}`;
}

function first(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function firstPositiveNumber(...vals) {
  for (const v of vals) {
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return NaN;
}

function toObjectArray(input) {
  return Array.isArray(input)
    ? input.filter((x) => typeof x === "object" && x !== null)
    : [];
}

function firstItemArrayFromOrder(o) {
  const candidates = [
    o.items,
    o.orderItems,
    o.products,
    o.productDetails,
    o.lineItems,
    o.shopifyLineItems,
    o.cartItems,
  ];
  for (const c of candidates) {
    const arr = toObjectArray(c);
    if (arr.length > 0) return arr;
  }
  return [];
}

function parseBoxCmFromDimensions(dimensions) {
  const raw = String(dimensions ?? "").trim();
  if (!raw) return undefined;
  const firstBox = raw.split(";")[0].trim().replace(/cm/gi, "").trim();
  const parts = firstBox.split(/x/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 3) return undefined;
  const nums = parts.map((p) => Number.parseFloat(p)).filter((n) => !Number.isNaN(n));
  if (nums.length < 3) return undefined;
  return { length: nums[0], width: nums[1], height: nums[2] };
}

function parseWeightKgFromOrder(weight) {
  const m = String(weight ?? "").match(/[\d.]+/);
  return m ? Number.parseFloat(m[0]) : 0;
}

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 12000 });
const db = mongoose.connection.db;
const order = await db.collection("orders").findOne({ orderId: TARGET_ORDER_ID });

if (!order) {
  console.log(JSON.stringify({ error: "ORDER_NOT_FOUND", orderId: TARGET_ORDER_ID }, null, 2));
  await mongoose.disconnect();
  process.exit(0);
}

const shippingAddress = order.shippingAddress || order.shipping_address || undefined;
const box = parseBoxCmFromDimensions(
  first(String(order.dimensions ?? ""), String(shippingAddress?.dimensions ?? ""))
);
const wKg = parseWeightKgFromOrder(first(String(order.weight ?? "")));

const customer = {
  name: first(order.customerName, order.consigneeName, shippingAddress?.name, order.customer),
  phone: first(order.customerPhone, order.phone, shippingAddress?.phone),
  email: first(order.customerEmail, order.email, shippingAddress?.email) || undefined,
  address: first(
    order.customerAddress,
    order.addressLine1,
    shippingAddress?.address,
    shippingAddress?.street,
    shippingAddress?.addressLine1,
    order.address
  ),
  city: first(order.customerCity, shippingAddress?.city, order.city),
  state: first(order.customerState, order.shippingState, shippingAddress?.state, order.state),
  pincode: first(
    order.customerPincode,
    order.shippingPincode,
    order.pincode,
    shippingAddress?.pincode,
    shippingAddress?.zip,
    shippingAddress?.postalCode
  )
    .replace(/\D/g, "")
    .slice(0, 6),
  country: first(shippingAddress?.country, order.country) || "India",
};

const sourceItems = firstItemArrayFromOrder(order);
let items = sourceItems.map((it, idx) => {
  const name = first(it.name, it.productName, it.title, "Item");
  const sku = first(it.sku, it.productSku, `SKU-${idx + 1}`);
  const qty = Number(it.quantity ?? it.qty ?? it.units ?? 1);
  const price = Number(
    it.price ??
      it.sellingPrice ??
      it.amount ??
      order.sub_total ??
      order.totalAmount ??
      order.amount ??
      1
  );
  return {
    name,
    sku,
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    price: Number.isFinite(price) && price > 0 ? price : 1,
    discount: Number(it.discount ?? 0) || 0,
    tax: Number(it.tax ?? 0) || 0,
    weight: it.weight != null ? Number(it.weight) : undefined,
  };
});

if (
  !items.length &&
  (order.productName ||
    order.product ||
    order.sku ||
    order.quantity ||
    order.qty ||
    order.subTotal ||
    order.totalAmount ||
    order.amount)
) {
  items = [
    {
      name: first(order.productName, order.product, "Shipment Item"),
      sku: first(order.sku, `SKU-${String(order.orderId ?? "order")}`),
      qty: Number(order.quantity ?? order.qty ?? 1) > 0 ? Number(order.quantity ?? order.qty ?? 1) : 1,
      price:
        Number(order.subTotal ?? order.totalAmount ?? order.amount ?? 1) > 0
          ? Number(order.subTotal ?? order.totalAmount ?? order.amount ?? 1)
          : 1,
      discount: 0,
      tax: 0,
    },
  ];
}

const internalPayload = {
  warehouse_id: String(order.velocityWarehouseId ?? ""),
  order_id: String(order.orderId ?? ""),
  payment_mode: String(order.payment ?? "").toLowerCase() === "cod" ? "cod" : "prepaid",
  cod_amount: String(order.payment ?? "").toLowerCase() === "cod" ? order.amount : undefined,
  order_amount: Number(order.amount ?? 0),
  weight: firstPositiveNumber(order.weight, order.packageWeight, order.deadWeight, wKg),
  length: firstPositiveNumber(order.length, order.packageLength, box?.length),
  width: firstPositiveNumber(
    order.width,
    order.breadth,
    order.packageBreadth,
    order.packageWidth,
    box?.width
  ),
  height: firstPositiveNumber(order.height, order.packageHeight, box?.height),
  customer,
  items,
};

const providerPayload = buildVelocityForwardOrchestrationPayload(internalPayload);
const sanitizedProvider = sanitizeForVelocityLog(providerPayload);

const out = {
  identity: {
    _id: String(order._id),
    orderId: order.orderId ?? "",
    orderNumber: order.orderNumber ?? "",
    externalOrderId: order.externalOrderId ?? "",
    velocityOrderId: order.velocityOrderId ?? "",
    velocityShipmentId: order.velocityShipmentId ?? "",
    awbCode: order.awbCode ?? order.awb ?? "",
    labelUrl: order.labelUrl ?? "",
  },
  customer: {
    name: customer.name,
    phone: maskPhone(customer.phone),
    email: maskEmail(customer.email),
    address: customer.address,
    city: customer.city,
    state: customer.state,
    pincode: customer.pincode,
  },
  package: {
    weight: internalPayload.weight,
    length: internalPayload.length,
    breadth: Number.isFinite(Number(order.breadth)) ? Number(order.breadth) : undefined,
    width: internalPayload.width,
    height: internalPayload.height,
  },
  items: {
    items: order.items ?? null,
    orderItems: order.orderItems ?? null,
    lineItems: order.lineItems ?? null,
    products: order.products ?? null,
    shopifyLineItems: order.shopifyLineItems ?? null,
    rawShopifyOrderLineItems: order.rawShopifyOrder?.line_items ?? null,
  },
  pickup: {
    pickupAddressId: order.pickupAddressId ?? "",
    pickupWarehouseId: order.pickupWarehouseId ?? "",
    pickupAddress: order.pickupAddress ?? "",
    velocityWarehouseId: order.velocityWarehouseId ?? "",
  },
  velocityPayload: {
    order_id: sanitizedProvider.order_id,
    billing_pincode: sanitizedProvider.billing_pincode,
    warehouse_id: sanitizedProvider.warehouse_id,
    order_items: sanitizedProvider.order_items,
    payment_method: sanitizedProvider.payment_mode,
    sub_total: sanitizedProvider.order_amount,
    cod_collectible: sanitizedProvider.cod_amount ?? 0,
    weight: sanitizedProvider.weight,
    length: sanitizedProvider.length,
    width: sanitizedProvider.width,
    height: sanitizedProvider.height,
  },
};

console.log(JSON.stringify(out, null, 2));
await mongoose.disconnect();
