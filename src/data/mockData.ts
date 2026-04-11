// Mock data for the logistics platform

export type OrderStatus = 'delivered' | 'in-transit' | 'out-for-delivery' | 'ndr' | 'rto' | 'pending' | 'ready-to-ship' | 'not-picked' | 'cancelled' | 'draft' | 'on-process';
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
}

const names = ['Amit Sharma', 'Priya Patel', 'Rahul Kumar', 'Sneha Gupta', 'Vikram Singh', 'Anjali Verma', 'Ravi Joshi', 'Pooja Nair', 'Suresh Reddy', 'Kavita Mehta', 'Deepak Yadav', 'Neha Agarwal', 'Manoj Tiwari', 'Sunita Das', 'Arun Pillai', 'Meera Iyer', 'Gaurav Bansal', 'Ritika Saxena', 'Ajay Chauhan', 'Divya Kapoor'];

const cities = ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Hyderabad', 'Pune', 'Kolkata', 'Ahmedabad', 'Jaipur', 'Lucknow'];
const pincodes = ['400001', '110001', '560001', '600001', '500001', '411001', '700001', '380001', '302001', '226001'];
const couriers: CourierName[] = ['Delhivery', 'Blue Dart', 'DTDC', 'Ekart', 'XpressBees', 'Shadowfax'];
const statuses: OrderStatus[] = ['delivered', 'in-transit', 'out-for-delivery', 'ndr', 'rto', 'pending', 'ready-to-ship', 'not-picked', 'cancelled', 'draft'];
const productNames = ['Cotton T-Shirt', 'Leather Wallet', 'Phone Case', 'Bluetooth Earbuds', 'Yoga Mat', 'Running Shoes', 'Backpack', 'Sunglasses', 'Watch', 'Water Bottle', 'Book Set', 'Laptop Stand', 'Mouse Pad', 'LED Light Strip', 'Travel Mug'];

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
  };
});

export interface Dropshipper {
  id: string; name: string; email: string; phone: string; totalOrders: number; activeOrders: number; wallet: number; status: 'Active' | 'Inactive';
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
}));

export interface Vendor {
  id: string; name: string; city: string; pin: string; assignedVendors: number; ordersToday: number; status: 'Active' | 'Inactive';
}

export const vendors: Vendor[] = [
  { id: 'WH001', name: 'Mumbai Central Hub', city: 'Mumbai', pin: '400001', assignedVendors: 8, ordersToday: 142, status: 'Active' },
  { id: 'WH002', name: 'Delhi NCR Warehouse', city: 'Delhi', pin: '110001', assignedVendors: 12, ordersToday: 210, status: 'Active' },
  { id: 'WH003', name: 'Bangalore Tech Park', city: 'Bangalore', pin: '560001', assignedVendors: 6, ordersToday: 98, status: 'Active' },
  { id: 'WH004', name: 'Chennai Port Hub', city: 'Chennai', pin: '600001', assignedVendors: 4, ordersToday: 55, status: 'Active' },
  { id: 'WH005', name: 'Kolkata East Center', city: 'Kolkata', pin: '700001', assignedVendors: 3, ordersToday: 34, status: 'Inactive' },
];

export const courierList = couriers.map((c, i) => ({
  name: c,
  active: i !== 5,
  priority: i + 1,
  deliveryRate: 85 + (i % 10),
  ndrRate: 5 + (i % 5),
  rtoRate: 8 + (i % 7),
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
}));

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
