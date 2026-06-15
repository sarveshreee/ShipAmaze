/** Domain types for orders and logistics UI — no mock rows */

export type OrderStatus =
  | "delivered"
  | "in-transit"
  | "out-for-delivery"
  | "ndr"
  | "rto"
  | "pending"
  | "ready-to-ship"
  | "not-picked"
  | "cancelled"
  | "junk"
  | "shipped"
  | "draft"
  | "on-process"
  | "rts";

export type PaymentType = "COD" | "Prepaid";

export type CourierName =
  | "Delhivery"
  | "Blue Dart"
  | "DTDC"
  | "Ekart"
  | "XpressBees"
  | "Shadowfax";

export interface TrackingActivity {
  date: string;
  activity: string;
  location: string;
}

export interface OrderStatusEvent {
  status: string;
  at: string;
  updatedBy?: string;
  note?: string;
}

export interface Order {
  id: string;
  customer: string;
  phone: string;
  address: string;
  city: string;
  state?: string;
  pincode: string;
  weight: string;
  length?: number;
  width?: number;
  breadth?: number;
  height?: number;
  courier: CourierName | string;
  payment: PaymentType;
  status: OrderStatus;
  date: string;
  awb: string;
  amount: number;
  products: { name: string; productName?: string; qty: number; price: number; weight: string; sku?: string; productCode?: string }[];
  /** Line items (alias of products / orderItems from API) */
  items?: {
    name: string;
    productName?: string;
    qty: number;
    price: number;
    weight?: string;
    sku?: string;
    productCode?: string;
  }[];
  /** Raw line items from API when present */
  orderItems?: {
    name: string;
    productName?: string;
    qty: number;
    price: number;
    weight?: string;
    sku?: string;
    productCode?: string;
  }[];
  dimensions?: string;
  zone?: string;
  pickupAddress?: string | {
    id: string;
    label: string;
    warehouseName?: string;
    contactName?: string;
    phone?: string;
    alternatePhone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
    gstin?: string;
    velocityWarehouseId?: string;
  };
  // Velocity Shipping fields
  velocityOrderId?: string;
  velocityShipmentId?: string;
  courierCompanyId?: number | string;
  courierName?: string;
  labelUrl?: string;
  manifestUrl?: string;
  shippingCharges?: number;
  codCharges?: number;
  rtoCharges?: number;
  shipmentStatus?: string;
  trackingUrl?: string;
  trackingActivities?: TrackingActivity[];
  velocityWarehouseId?: string;
  assignedDateTime?: string;
  channel?: string;
  externalSource?: string;
  externalOrderName?: string;
  sourceType?: string;
  statusHistory?: OrderStatusEvent[];
  updatedAt?: string;
  shipmentCreated?: boolean;
  shipmentId?: string;
  trackingId?: string;
  /** Mongo Pickup document id when order used saved pickup address */
  pickupAddressId?: string;
  isJunk?: boolean;
  junkedAt?: string;
  junkReason?: string;
  movedToReadyAt?: string;
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress1?: string;
  shippingAddress2?: string;
  shippingPincode?: string;
  shippingCity?: string;
  shippingState?: string;
  /** Shopify Admin REST order id (stringified) */
  shopifyOrderNumericId?: string;
  shopifyShopDomain?: string;
  shopifyFinancialStatus?: string;
  shopifyFulfillmentStatus?: string;
  shopifyNote?: string;
  shopifyTags?: string;
  lastShopifySyncAt?: string;
  vendorId?: string;
}

export interface Dropshipper {
  id: string;
  /** User._id — use this for API calls, not `id` (Dropshipper document). */
  userId?: string;
  name: string;
  email: string;
  phone: string;
  totalOrders: number;
  activeOrders: number;
  wallet: number;
  status: "Active" | "Inactive";
  kycVerified?: boolean;
  joinDate?: string;
}

export interface Vendor {
  id: string;
  name: string;
  city: string;
  pin: string;
  assignedVendors: number;
  ordersToday: number;
  status: "Active" | "Inactive";
  contactPerson?: string;
  phone?: string;
  email?: string;
  ownerUserId?: string;
  assignedUserIds?: string[];
}

export type WalletTxnStatus = "completed" | "pending" | "failed";

export type WalletTxnDisplayType = "Credit" | "Debit" | "COD" | "Recharge" | "Deduction" | "Adjustment";

export interface Transaction {
  id: string;
  date: string;
  description: string;
  txnId: string;
  type: "Credit" | "Debit";
  amount: number;
  balance: number;
  balanceBefore?: number;
  status: WalletTxnStatus;
  displayType: WalletTxnDisplayType;
  ledgerType?: string;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  createdAt?: string;
}

export interface WeightDispute {
  id: string;
  orderId: string;
  awb: string;
  courier: CourierName;
  sellerWeight: string;
  courierWeight: string;
  diff: string;
  chargedAmount: number;
  expectedAmount: number;
  status: "Open" | "Accepted" | "Rejected" | "Escalated";
  date: string;
}

export interface ReturnOrder {
  id: string;
  originalOrderId: string;
  awb: string;
  customer: string;
  reason: string;
  courier: CourierName;
  status:
    | "Return Requested"
    | "Pickup Scheduled"
    | "In Transit"
    | "Received"
    | "Refund Processed"
    | "Cancelled";
  date: string;
  refundAmount: number;
  weight: string;
}

export interface PickupAddress {
  id: string;
  label: string;
  /** Same as label — API alias for warehouse-style naming */
  warehouseName?: string;
  pickupName?: string;
  contactName: string;
  contactPerson?: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  addressLine1: string;
  addressLine2: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
  gstin?: string;
  isDefault: boolean;
  isActive?: boolean;
  /** Set after linking to Velocity dashboard warehouse */
  velocityWarehouseId?: string;
  /** Present when API exposes explicit link flag */
  velocityLinked?: boolean;
  /** Velocity sync / link status from integration when available */
  velocityStatus?: string;
  /** Set when this pickup was auto-synced from a vendor Warehouse document */
  sourceWarehouseId?: string;
  /** Role of the actor who caused this pickup to be created */
  createdByRole?: "admin" | "vendor" | "dropshipper";
  /** Vendor ID when createdByRole is vendor or dropshipper */
  vendorId?: string;
}

export interface Manifest {
  id: string;
  date: string;
  courier: CourierName;
  ordersCount: number;
  totalWeight: string;
  pickupAddress: string;
  status: "Generated" | "Scheduled" | "Picked Up" | "Cancelled";
  pickupTime?: string;
}

export interface CODRemittance {
  id: string;
  dropshipper: string;
  ordersCount: number;
  codAmount: number;
  deductions: number;
  netPayable: number;
  status: "Pending" | "Processing" | "Settled" | "On Hold";
  settleDate: string;
  utr?: string;
}

export interface Invoice {
  id: string;
  date: string;
  period: string;
  orders: number;
  shippingCharges: number;
  codCharges: number;
  gst: number;
  total: number;
  status: "Paid" | "Unpaid" | "Overdue" | "Cancelled" | string;
  downloadUrl?: string;
}

export interface PincodeService {
  pincode: string;
  city: string;
  state: string;
  zone: string;
  couriers: { name: CourierName; surface: boolean; air: boolean; cod: boolean; estimatedDays: string }[];
}
