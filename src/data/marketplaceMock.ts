// Mock marketplace data — used as fallback when no live products exist
import type { SupplierProduct } from "@/hooks/useSupplierProducts";

export const MARKETPLACE_CATEGORIES = [
  { slug: "extreme-profitable", name: "Extreme Profitable Products", emoji: "🔥" },
  { slug: "gardening", name: "Gardening Products", emoji: "🌱" },
  { slug: "accessories", name: "Accessories", emoji: "👜" },
  { slug: "gym-wellness", name: "Gym & Wellness", emoji: "💪" },
  { slug: "men", name: "Men", emoji: "👔" },
  { slug: "beauty", name: "Beauty & Personal Care", emoji: "💄" },
  { slug: "auto", name: "Car & Bike Accessories", emoji: "🚗" },
  { slug: "home-living", name: "Home and Living", emoji: "🛋️" },
  { slug: "testing", name: "Testing Products", emoji: "🔬" },
  { slug: "kids", name: "Kids", emoji: "🧸" },
];

const img = (seed: string) =>
  `https://images.unsplash.com/photo-${seed}?auto=format&fit=crop&w=600&q=70`;

const seeds = [
  "1505740420928-5e560c06d30e",
  "1542291026-7eec264c27ff",
  "1523275335684-37898b6baf30",
  "1526170375885-4d8ecf77b99f",
  "1583394838336-acd977736f90",
  "1585386959984-a4155224a1ad",
  "1571781926291-c477ebfd024b",
  "1503602642458-232111445657",
  "1515886657613-9f3515b0c78f",
  "1556228720-195a672e8a03",
];

const cats = ["Gardening Products", "Accessories", "Gym & Wellness", "Men", "Beauty & Personal Care", "Car & Bike Accessories", "Home and Living", "Kids"];

let _id = 1000;
const make = (name: string, category: string, price: number, idx: number): SupplierProduct => ({
  id: `mock-${++_id}`,
  name,
  sku: `DD${5000 + _id}`,
  category,
  brand: "DropDash",
  status: "active",
  price,
  selling_price: Math.round(price * 1.5),
  stock: 50 + Math.floor(Math.random() * 1500),
  weight: `${(0.2 + Math.random()).toFixed(2)} kg`,
  dimensions: "20x15x10",
  hsn: "9999",
  short_description: `Premium ${category.toLowerCase()} item with excellent quality.`,
  long_description: `${name} — designed for modern needs, sourced from verified vendors.`,
  tags: [category.split(" ")[0]],
  unit: "pcs",
  min_order_qty: 1,
  images: [img(seeds[idx % seeds.length])],
  primary_image_index: 0,
  length_cm: 20, width_cm: 15, height_cm: 10,
  shipping_class: "standard",
  pickup_location_id: null,
  cod_available: true, returnable: true, fragile: false,
  gst_percent: 18, country_of_origin: "India",
  warranty: "", manufacturer: "", care_instructions: "",
  seo_title: "", seo_description: "", internal_notes: "",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  user_id: null, vendor_id: null, vendor_name: "DropDash Verified Supplier",
  uploaded_by_role: "vendor",
});

const names: Record<string, string[]> = {
  "Gardening Products": ["Lifting and Ridging Plant Tool", "Iron Rake for Gardening", "3-in-1 Garden Flat Axe", "Grass Sickle Cutter", "Cyclosinone Herbicide", "Mini Plant Pots Set"],
  "Accessories": ["Leather Wallet Premium", "Phone Stand Mount", "Bluetooth Earbuds Pro", "Smart Watch Band", "Travel Organizer Pouch", "Sunglasses Case"],
  "Gym & Wellness": ["Knee Compression Sleeve", "Posture Corrector", "Bamboo Yarn Knee Brace", "Thigh Master Trainer", "Strength Eagle Claw Grip", "Resistance Bands Set"],
  "Men": ["Slim Fit Suit", "Cotton Boxer Pack", "Tactical Nylon Belt", "Joggers Pant Set", "Casual Polo Shirt", "Formal Dress Shirt"],
  "Beauty & Personal Care": ["Vitamin C Serum", "Anti-Aging Cream", "Hair Growth Oil", "Face Wash Combo", "Lip Tint Pack", "Nail Care Kit"],
  "Car & Bike Accessories": ["Car Phone Holder", "LED Headlight Bulb", "Bike Cover Waterproof", "Dashboard Mat", "Tire Inflator Mini", "Steering Wheel Cover"],
  "Home and Living": ["Storage Organizer Box", "LED String Lights", "Kitchen Knife Set", "Bedsheet Combo", "Wall Art Frame", "Throw Pillow Cover"],
  "Kids": ["Educational Building Blocks", "Soft Plush Toy", "Kids Backpack", "Drawing Kit Premium", "Magnetic Puzzle", "Toy Vehicle Set"],
};

export const MOCK_PRODUCTS: SupplierProduct[] = cats.flatMap((c, ci) =>
  (names[c] || []).map((n, i) => make(n, c, 99 + (ci * 30) + (i * 25), ci + i))
);
