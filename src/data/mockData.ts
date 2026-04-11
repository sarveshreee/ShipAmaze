// Mock data for the logistics platform

export type OrderStatus = 'delivered' | 'in-transit' | 'out-for-delivery' | 'ndr' | 'rto' | 'pending' | 'ready-to-ship' | 'not-picked' | 'cancelled' | 'draft' | 'on-process' | 'rts';
export type PaymentType = 'COD' | 'Prepaid';
export type CourierName = 'Delhivery' | 'Blue Dart' | 'DTDC' | 'Ekart' | 'XpressBees' | 'Shadowfax';

export interface Order {
  id: string;
  customer: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
  weight: string;
  courier: CourierName;
  payment: PaymentType;
  status: OrderStatus;
  date: string;
  awb: string;
  amount: number;
  products: { name: string; qty: number; price: number; weight: string }[];
  dimensions?: string;
  zone?: string;
  pickupAddress?: string;
}

const names = ['Amit Sharma', 'Priya Patel', 'Rahul Kumar', 'Sneha Gupta', 'Vikram Singh', 'Anjali Verma', 'Ravi Joshi', 'Pooja Nair', 'Suresh Reddy', 'Kavita Mehta', 'Deepak Yadav', 'Neha Agarwal', 'Manoj Tiwari', 'Sunita Das', 'Arun Pillai', 'Meera Iyer', 'Gaurav Bansal', 'Ritika Saxena', 'Ajay Chauhan', 'Divya Kapoor'];

const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Lucknow'];
const pincodes = ['400001', '110001', '560001', '600001', '500001', '411001', '700001', '380001', '302001', '226001'];
const couriers: CourierName[] = ['Delhivery', 'Blue Dart', 'DTDC', 'Ekart', 'XpressBees', 'Shadowfax'];
const statuses: OrderStatus[] = ['delivered', 'in-transit', 'out-for-delivery', 'ndr', 'rto', 'pending', 'ready-to-ship', 'not-picked', 'cancelled', 'draft'];
const productNames = ['Cotton T-Shirt', 'Leather Wallet', 'Phone Case', 'Bluetooth Earbuds', 'Yoga Mat', 'Running Shoes', 'Backpack', 'Sunglasses', 'Watch', 'Water Bottle', 'Book Set', 'Laptop Stand', 'Mouse Pad', 'LED Light Strip', 'Travel Mug'];
const zones = ['A', 'B', 'C', 'D', 'E'];

export const orders: Order[] = Array.from({ length: 50 }, (_, i) => {
  const ci = i % cities.length;
  return {
    id: `SF${String(10001 + i)}`,
    customer: names[i % names.length],
    phone: `+91 ${9800000000 + i * 137}`,
    address: `${100 + i}, MG Road, ${cities[ci]}`,
    city: cities[ci],
    pincode: pincodes[ci],
    weight: `${(0.5 + (i % 10) * 0.3).toFixed(1)} kg`,
    courier: couriers[i % couriers.length],
    payment: i % 3 === 0 ? 'COD' : 'Prepaid',
    status: statuses[i % statuses.length],
    date: `2026-04-${String(1 + (i % 11)).padStart(2, '0')}`,
    awb: `AWB${String(900000000 + i * 111)}`,
    amount: 299 + i * 47,
    products: [{ name: productNames[i % productNames.length], qty: 1 + (i % 3), price: 299 + i * 47, weight: `${(0.2 + (i % 5) * 0.1).toFixed(1)} kg` }],
    dimensions: `${10 + i % 20}×${8 + i % 15}×${5 + i % 10} cm`,
    zone: zones[i % zones.length],
    pickupAddress: i % 2 === 0 ? 'Mumbai Central Hub' : 'Delhi NCR Warehouse',
  };
});

export interface Dropshipper {
  id: string; name: string; email: string; phone: string; totalOrders: number; activeOrders: number; wallet: number; status: 'Active' | 'Inactive';
  kycVerified?: boolean; joinDate?: string;
}

export const dropshippers: Dropshipper[] = Array.from({ length: 20 }, (_, i) => ({
  id: `DS${1001 + i}`,
  name: names[i],
  email: `${names[i].toLowerCase().replace(' ', '.')}@email.com`,
  phone: `+91 ${9700000000 + i * 111}`,
  totalOrders: 100 + i * 47,
  activeOrders: 5 + (i % 15),
  wallet: 1000 + i * 520,
  status: i % 5 === 0 ? 'Inactive' : 'Active',
  kycVerified: i % 3 !== 0,
  joinDate: `2026-0${1 + (i % 3)}-${String(5 + i).padStart(2, '0')}`,
}));

export interface Vendor {
  id: string; name: string; city: string; pin: string; assignedVendors: number; ordersToday: number; status: 'Active' | 'Inactive';
  contactPerson?: string; phone?: string; email?: string;
}

export const vendors: Vendor[] = [
  { id: 'WH001', name: 'Mumbai Central Hub', city: 'Mumbai', pin: '400001', assignedVendors: 8, ordersToday: 142, status: 'Active', contactPerson: 'Rajesh Mehta', phone: '+91 98001 11111', email: 'mumbai@shipflow.in' },
  { id: 'WH002', name: 'Delhi NCR Warehouse', city: 'Delhi', pin: '110001', assignedVendors: 12, ordersToday: 210, status: 'Active', contactPerson: 'Amit Shah', phone: '+91 98002 22222', email: 'delhi@shipflow.in' },
  { id: 'WH003', name: 'Bangalore Tech Park', city: 'Bangalore', pin: '560001', assignedVendors: 6, ordersToday: 98, status: 'Active', contactPerson: 'Suresh Rao', phone: '+91 98003 33333', email: 'blr@shipflow.in' },
  { id: 'WH004', name: 'Chennai Port Hub', city: 'Chennai', pin: '600001', assignedVendors: 4, ordersToday: 55, status: 'Active', contactPerson: 'Tamil Selvan', phone: '+91 98004 44444', email: 'chennai@shipflow.in' },
  { id: 'WH005', name: 'Kolkata East Center', city: 'Kolkata', pin: '700001', assignedVendors: 3, ordersToday: 34, status: 'Inactive', contactPerson: 'Bidhan Roy', phone: '+91 98005 55555', email: 'kolkata@shipflow.in' },
];

export const courierList = couriers.map((c, i) => ({
  name: c,
  active: i !== 5,
  priority: i + 1,
  deliveryRate: 85 + (i % 10),
  ndrRate: 5 + (i % 5),
  rtoRate: 8 + (i % 7),
  avgDeliveryDays: 2 + (i % 3),
  codSupport: true,
  reversePickup: i < 4,
  surfaceRate: 19 + i * 3,
  airRate: 35 + i * 5,
}));

export interface Transaction {
  id: string; date: string; description: string; txnId: string; type: 'Credit' | 'Debit'; amount: number; balance: number;
}

export const transactions: Transaction[] = Array.from({ length: 40 }, (_, i) => ({
  id: `TXN${5001 + i}`,
  date: `2026-04-${String(1 + (i % 11)).padStart(2, '0')}`,
  description: i % 3 === 0 ? 'Wallet Recharge' : i % 3 === 1 ? 'Shipping Charge - SF' + (10001 + i) : 'COD Settlement',
  txnId: `TXN${String(800000 + i * 7)}`,
  type: i % 3 === 0 || i % 3 === 2 ? 'Credit' : 'Debit',
  amount: i % 3 === 1 ? -(50 + i * 12) : 200 + i * 35,
  balance: 12450 + (i % 2 === 0 ? i * 35 : -i * 12),
}));

export const supportTickets = Array.from({ length: 15 }, (_, i) => ({
  id: `TK${2001 + i}`,
  subject: ['Order not delivered', 'Wrong item received', 'Refund pending', 'Weight dispute', 'COD not settled', 'Label issue', 'Pickup not scheduled', 'Rate discrepancy'][i % 8],
  raisedBy: names[i % names.length],
  category: ['Delivery', 'Returns', 'Billing', 'Pickup', 'Technical'][i % 5],
  priority: (['High', 'Medium', 'Low'] as const)[i % 3],
  status: (['Open', 'In Progress', 'Resolved', 'Closed'] as const)[i % 4],
  lastUpdate: `2026-04-${String(5 + (i % 7)).padStart(2, '0')}`,
}));

export const ndrOrders = Array.from({ length: 10 }, (_, i) => ({
  awb: `AWB${900000100 + i}`,
  customer: names[i + 5],
  seller: dropshippers[i]?.name || names[i],
  reason: (['Not at Home', 'Rejected', 'Wrong Address', 'Fake Attempt', 'Incomplete Address'] as const)[i % 5],
  attempts: 1 + (i % 3),
  lastUpdate: `2026-04-${String(8 + (i % 4)).padStart(2, '0')}`,
  status: (['Active', 'Initiated', 'Closed'] as const)[i % 3],
  phone: `+91 ${9800000000 + (i + 5) * 137}`,
  nextAction: (['Re-attempt', 'Contact Customer', 'Force RTO', 'Escalate', 'Verify Address'] as const)[i % 5],
}));

export const notifications = Array.from({ length: 10 }, (_, i) => ({
  id: `N${i + 1}`,
  title: ['New order received', 'NDR action required', 'COD settled', 'Pickup scheduled', 'Rate card updated', 'RTO initiated', 'Wallet low balance', 'Delivery completed', 'New dropshipper registered', 'Support ticket raised'][i],
  time: `${i + 1}h ago`,
  read: i > 4,
}));

export const products = Array.from({ length: 30 }, (_, i) => ({
  id: `PRD${3001 + i}`,
  name: productNames[i % productNames.length] + (i >= productNames.length ? ` V${Math.floor(i / productNames.length) + 1}` : ''),
  sku: `SKU-${String(1000 + i)}`,
  category: ['Apparel', 'Accessories', 'Electronics', 'Sports', 'Home'][i % 5],
  weight: `${(0.2 + (i % 8) * 0.15).toFixed(2)} kg`,
  price: 299 + i * 67,
  sellingPrice: 249 + i * 55,
  stock: 10 + i * 3,
  hsn: `${6100 + i * 10}`,
  dimensions: `${10 + i % 20}×${8 + i % 15}×${5 + i % 10} cm`,
}));

// Weight disputes
export interface WeightDispute {
  id: string; orderId: string; awb: string; courier: CourierName; sellerWeight: string; courierWeight: string; diff: string;
  chargedAmount: number; expectedAmount: number; status: 'Open' | 'Accepted' | 'Rejected' | 'Escalated'; date: string;
}

export const weightDisputes: WeightDispute[] = Array.from({ length: 12 }, (_, i) => ({
  id: `WD${4001 + i}`,
  orderId: `SF${10001 + i * 3}`,
  awb: `AWB${900000000 + i * 333}`,
  courier: couriers[i % couriers.length],
  sellerWeight: `${(0.5 + i * 0.2).toFixed(1)} kg`,
  courierWeight: `${(0.8 + i * 0.3).toFixed(1)} kg`,
  diff: `${(0.3 + i * 0.1).toFixed(1)} kg`,
  chargedAmount: 72 + i * 15,
  expectedAmount: 45 + i * 10,
  status: (['Open', 'Accepted', 'Rejected', 'Escalated'] as const)[i % 4],
  date: `2026-04-${String(3 + (i % 9)).padStart(2, '0')}`,
}));

// Return orders
export interface ReturnOrder {
  id: string; originalOrderId: string; awb: string; customer: string; reason: string;
  courier: CourierName; status: 'Return Requested' | 'Pickup Scheduled' | 'In Transit' | 'Received' | 'Refund Processed' | 'Cancelled';
  date: string; refundAmount: number; weight: string;
}

export const returnOrders: ReturnOrder[] = Array.from({ length: 15 }, (_, i) => ({
  id: `RET${6001 + i}`,
  originalOrderId: `SF${10005 + i * 2}`,
  awb: `RAWB${800000000 + i * 222}`,
  customer: names[i % names.length],
  reason: ['Wrong size', 'Damaged product', 'Not as described', 'Changed mind', 'Missing parts'][i % 5],
  courier: couriers[i % couriers.length],
  status: (['Return Requested', 'Pickup Scheduled', 'In Transit', 'Received', 'Refund Processed', 'Cancelled'] as const)[i % 6],
  date: `2026-04-${String(2 + (i % 10)).padStart(2, '0')}`,
  refundAmount: 299 + i * 47,
  weight: `${(0.3 + i * 0.2).toFixed(1)} kg`,
}));

// Pickup addresses
export interface PickupAddress {
  id: string; label: string; contactName: string; phone: string; addressLine1: string; addressLine2: string;
  city: string; state: string; pincode: string; isDefault: boolean;
}

export const pickupAddresses: PickupAddress[] = [
  { id: 'PA001', label: 'Main Warehouse', contactName: 'Rajesh Mehta', phone: '+91 98001 11111', addressLine1: '42, Andheri Industrial Estate', addressLine2: 'Near WEH Metro Station', city: 'Mumbai', state: 'Maharashtra', pincode: '400069', isDefault: true },
  { id: 'PA002', label: 'Office', contactName: 'Priya Sharma', phone: '+91 98002 22222', addressLine1: '15, Sector 62', addressLine2: 'Noida IT Park', city: 'Noida', state: 'Uttar Pradesh', pincode: '201301', isDefault: false },
  { id: 'PA003', label: 'Bangalore Hub', contactName: 'Kiran Rao', phone: '+91 98003 33333', addressLine1: '88, HSR Layout', addressLine2: '27th Main Road', city: 'Bangalore', state: 'Karnataka', pincode: '560102', isDefault: false },
];

// Manifests
export interface Manifest {
  id: string; date: string; courier: CourierName; ordersCount: number; totalWeight: string;
  pickupAddress: string; status: 'Generated' | 'Scheduled' | 'Picked Up' | 'Cancelled'; pickupTime?: string;
}

export const manifests: Manifest[] = Array.from({ length: 10 }, (_, i) => ({
  id: `MAN${7001 + i}`,
  date: `2026-04-${String(5 + (i % 7)).padStart(2, '0')}`,
  courier: couriers[i % couriers.length],
  ordersCount: 5 + i * 3,
  totalWeight: `${(2.5 + i * 1.2).toFixed(1)} kg`,
  pickupAddress: pickupAddresses[i % pickupAddresses.length].label,
  status: (['Generated', 'Scheduled', 'Picked Up', 'Cancelled'] as const)[i % 4],
  pickupTime: i % 4 === 1 ? `2026-04-${String(6 + (i % 7)).padStart(2, '0')} 10:00 AM` : undefined,
}));

// COD Remittance
export interface CODRemittance {
  id: string; dropshipper: string; ordersCount: number; codAmount: number; deductions: number;
  netPayable: number; status: 'Pending' | 'Processing' | 'Settled' | 'On Hold'; settleDate: string; utr?: string;
}

export const codRemittances: CODRemittance[] = Array.from({ length: 12 }, (_, i) => ({
  id: `COD${8001 + i}`,
  dropshipper: dropshippers[i % dropshippers.length].name,
  ordersCount: 5 + i * 2,
  codAmount: 2500 + i * 1200,
  deductions: 150 + i * 45,
  netPayable: 2350 + i * 1155,
  status: (['Pending', 'Processing', 'Settled', 'On Hold'] as const)[i % 4],
  settleDate: `2026-04-${String(10 + (i % 5)).padStart(2, '0')}`,
  utr: i % 4 === 2 ? `UTR${900000 + i * 111}` : undefined,
}));

// Billing / Invoices
export interface Invoice {
  id: string; date: string; period: string; orders: number; shippingCharges: number;
  codCharges: number; gst: number; total: number; status: 'Paid' | 'Unpaid' | 'Overdue'; downloadUrl?: string;
}

export const invoices: Invoice[] = Array.from({ length: 8 }, (_, i) => ({
  id: `INV${9001 + i}`,
  date: `2026-0${3 - (i % 3)}-${String(1 + i * 3).padStart(2, '0')}`,
  period: `${['Jan', 'Feb', 'Mar', 'Apr'][i % 4]} 2026`,
  orders: 120 + i * 45,
  shippingCharges: 5400 + i * 2100,
  codCharges: 800 + i * 340,
  gst: 1116 + i * 439,
  total: 7316 + i * 2879,
  status: (['Paid', 'Unpaid', 'Overdue'] as const)[i % 3],
}));

// Pincode serviceability
export interface PincodeService {
  pincode: string; city: string; state: string; zone: string;
  couriers: { name: CourierName; surface: boolean; air: boolean; cod: boolean; estimatedDays: string }[];
}

export const pincodeServiceData: PincodeService[] = pincodes.map((pin, i) => ({
  pincode: pin,
  city: cities[i],
  state: ['Maharashtra', 'Delhi', 'Karnataka', 'Tamil Nadu', 'Telangana', 'Maharashtra', 'West Bengal', 'Gujarat', 'Rajasthan', 'Uttar Pradesh'][i],
  zone: zones[i % zones.length],
  couriers: couriers.slice(0, 4 + (i % 3)).map((c, j) => ({
    name: c,
    surface: true,
    air: j < 3,
    cod: j < 4,
    estimatedDays: `${2 + (j % 3)}-${3 + (j % 3)} days`,
  })),
}));

// Rate card data
export const rateCardData = {
  zones: ['A', 'B', 'C', 'D', 'E'] as const,
  weightSlabs: ['0.5 kg', '1 kg', '2 kg', '5 kg', '10 kg'] as const,
  rates: {
    A: [29, 39, 59, 119, 199],
    B: [35, 49, 75, 145, 249],
    C: [42, 59, 89, 169, 299],
    D: [49, 69, 109, 199, 349],
    E: [55, 79, 125, 229, 399],
  } as Record<string, number[]>,
};

// Chart data
export const ordersOverTime = Array.from({ length: 30 }, (_, i) => ({
  date: `Apr ${i + 1}`,
  total: 600 + Math.floor(Math.random() * 300),
  delivered: 450 + Math.floor(Math.random() * 200),
  rto: 40 + Math.floor(Math.random() * 60),
}));

export const courierPerformance = couriers.map(c => ({
  name: c,
  delivered: 75 + Math.floor(Math.random() * 20),
  ndr: 3 + Math.floor(Math.random() * 8),
  rto: 5 + Math.floor(Math.random() * 10),
}));

export const ordersByStatus = [
  { name: 'Delivered', value: 19240, color: 'hsl(var(--color-success))' },
  { name: 'In Transit', value: 3200, color: 'hsl(var(--color-secondary))' },
  { name: 'NDR', value: 1940, color: 'hsl(var(--color-warning))' },
  { name: 'RTO', value: 2840, color: 'hsl(var(--color-danger))' },
  { name: 'Pending', value: 1200, color: 'hsl(var(--color-tertiary))' },
  { name: 'Other', value: 471, color: 'hsl(var(--color-text-muted))' },
];

export const weeklyOrders = [
  { day: 'Mon', orders: 120 }, { day: 'Tue', orders: 145 }, { day: 'Wed', orders: 98 },
  { day: 'Thu', orders: 167 }, { day: 'Fri', orders: 189 }, { day: 'Sat', orders: 134 }, { day: 'Sun', orders: 78 },
];

// Monthly revenue data for reports
export const monthlyRevenue = Array.from({ length: 6 }, (_, i) => ({
  month: ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'][i],
  revenue: 180000 + Math.floor(Math.random() * 80000),
  shipping: 120000 + Math.floor(Math.random() * 50000),
  profit: 40000 + Math.floor(Math.random() * 30000),
}));

// States dropdown
export const indianStates = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu and Kashmir', 'Ladakh',
];
