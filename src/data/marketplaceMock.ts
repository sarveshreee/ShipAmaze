// Mock marketplace data — realistic per-product names + matching images
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

// Use Unsplash keyword search so each image actually matches the product topic.
const img = (keywords: string, seed: number) =>
  `https://source.unsplash.com/600x600/?${encodeURIComponent(keywords)}&sig=${seed}`;

type Seed = { name: string; keywords: string; price: number };

const catalog: Record<string, Seed[]> = {
  "Gardening Products": [
    { name: "Iron Rake for Gardening", keywords: "garden,rake,tool", price: 249 },
    { name: "3-in-1 Garden Flat Axe", keywords: "garden,axe,tool", price: 399 },
    { name: "Grass Sickle Cutter", keywords: "sickle,grass,cutter", price: 199 },
    { name: "Lifting & Ridging Plant Tool", keywords: "garden,shovel,plant", price: 349 },
    { name: "Mini Plant Pots Set (6 pcs)", keywords: "plant,pot,ceramic", price: 499 },
    { name: "Hand Pruning Shears", keywords: "pruning,shears,garden", price: 299 },
    { name: "Watering Can 5L", keywords: "watering,can,garden", price: 379 },
    { name: "Organic Plant Fertilizer", keywords: "fertilizer,plant,soil", price: 229 },
  ],
  "Accessories": [
    { name: "Premium Leather Wallet", keywords: "leather,wallet", price: 599 },
    { name: "Adjustable Phone Stand", keywords: "phone,stand,desk", price: 299 },
    { name: "Wireless Bluetooth Earbuds", keywords: "earbuds,wireless,headphones", price: 999 },
    { name: "Stainless Steel Watch", keywords: "wristwatch,steel,watch", price: 1499 },
    { name: "Travel Organizer Pouch", keywords: "travel,organizer,pouch", price: 449 },
    { name: "Polarized Sunglasses", keywords: "sunglasses,eyewear", price: 699 },
    { name: "Genuine Leather Belt", keywords: "leather,belt,men", price: 549 },
    { name: "Crossbody Sling Bag", keywords: "sling,bag,crossbody", price: 799 },
  ],
  "Gym & Wellness": [
    { name: "Knee Compression Sleeve", keywords: "knee,brace,gym", price: 349 },
    { name: "Posture Corrector Belt", keywords: "posture,corrector,back", price: 499 },
    { name: "Hand Grip Strengthener", keywords: "hand,grip,exercise", price: 199 },
    { name: "Resistance Bands Set (5)", keywords: "resistance,bands,gym", price: 599 },
    { name: "Yoga Mat Anti-Slip 6mm", keywords: "yoga,mat,exercise", price: 799 },
    { name: "Skipping Rope Pro", keywords: "skipping,rope,fitness", price: 249 },
    { name: "Adjustable Dumbbell 5kg", keywords: "dumbbell,weights,gym", price: 1299 },
    { name: "Foam Roller Muscle Recovery", keywords: "foam,roller,fitness", price: 699 },
  ],
  "Men": [
    { name: "Slim Fit Cotton Shirt", keywords: "men,shirt,cotton", price: 799 },
    { name: "Casual Polo T-Shirt", keywords: "polo,tshirt,men", price: 599 },
    { name: "Tactical Nylon Belt", keywords: "tactical,belt,nylon", price: 449 },
    { name: "Slim Joggers Pants", keywords: "joggers,pants,men", price: 899 },
    { name: "Formal Dress Shirt", keywords: "formal,shirt,men", price: 999 },
    { name: "Beard Grooming Kit", keywords: "beard,grooming,men", price: 749 },
    { name: "Leather Loafers", keywords: "loafers,leather,shoes", price: 1599 },
    { name: "Aviator Sunglasses", keywords: "aviator,sunglasses,men", price: 899 },
  ],
  "Beauty & Personal Care": [
    { name: "Vitamin C Face Serum", keywords: "serum,skincare,bottle", price: 499 },
    { name: "Anti-Aging Night Cream", keywords: "cream,skincare,jar", price: 699 },
    { name: "Hair Growth Onion Oil", keywords: "hair,oil,bottle", price: 349 },
    { name: "Foaming Face Wash", keywords: "facewash,skincare", price: 299 },
    { name: "Matte Lipstick Set", keywords: "lipstick,makeup,beauty", price: 599 },
    { name: "Manicure Nail Care Kit", keywords: "manicure,nail,kit", price: 449 },
    { name: "Floral Eau De Parfum", keywords: "perfume,bottle,fragrance", price: 999 },
    { name: "Aloe Vera Moisturizer", keywords: "aloe,moisturizer,skincare", price: 379 },
  ],
  "Car & Bike Accessories": [
    { name: "Magnetic Car Phone Holder", keywords: "car,phone,holder", price: 349 },
    { name: "LED Headlight Bulb H4", keywords: "led,headlight,car", price: 799 },
    { name: "Waterproof Bike Cover", keywords: "bike,cover,motorcycle", price: 599 },
    { name: "Anti-Slip Dashboard Mat", keywords: "dashboard,car,interior", price: 249 },
    { name: "Mini Tire Inflator Pump", keywords: "tire,inflator,pump", price: 1299 },
    { name: "Leather Steering Wheel Cover", keywords: "steering,wheel,car", price: 449 },
    { name: "Car Vacuum Cleaner", keywords: "car,vacuum,cleaner", price: 999 },
    { name: "Bike Helmet ISI Certified", keywords: "helmet,motorcycle,bike", price: 1499 },
  ],
  "Home and Living": [
    { name: "Multi-Purpose Storage Box", keywords: "storage,box,organizer", price: 599 },
    { name: "LED Fairy String Lights 10m", keywords: "fairy,lights,led", price: 349 },
    { name: "Stainless Kitchen Knife Set", keywords: "kitchen,knife,set", price: 999 },
    { name: "Cotton Double Bedsheet", keywords: "bedsheet,cotton,bedroom", price: 799 },
    { name: "Modern Wall Art Frame", keywords: "wall,art,frame", price: 549 },
    { name: "Velvet Throw Pillow Cover", keywords: "pillow,cushion,sofa", price: 299 },
    { name: "Aromatic Scented Candle", keywords: "candle,scented,decor", price: 399 },
    { name: "Bamboo Cutlery Holder", keywords: "bamboo,cutlery,kitchen", price: 449 },
  ],
  "Kids": [
    { name: "Educational Building Blocks", keywords: "building,blocks,toy", price: 699 },
    { name: "Soft Plush Teddy Bear", keywords: "teddy,bear,plush", price: 499 },
    { name: "Kids School Backpack", keywords: "kids,backpack,school", price: 799 },
    { name: "Drawing & Coloring Kit", keywords: "crayons,coloring,kids", price: 349 },
    { name: "Magnetic Puzzle Board", keywords: "puzzle,kids,toy", price: 599 },
    { name: "Remote Control Toy Car", keywords: "remote,car,toy", price: 1299 },
    { name: "Wooden Alphabet Blocks", keywords: "wooden,alphabet,blocks", price: 449 },
    { name: "Kids Tricycle", keywords: "tricycle,kids,bike", price: 1899 },
  ],
};

let _id = 1000;
const make = (s: Seed, category: string): SupplierProduct => {
  _id += 1;
  return {
    id: `mock-${_id}`,
    name: s.name,
    sku: `SF${5000 + _id}`,
    category,
    brand: "Shipflow",
    status: "active",
    price: s.price,
    selling_price: Math.round(s.price * 1.6),
    stock: 50 + Math.floor(Math.random() * 1500),
    weight: `${(0.2 + Math.random()).toFixed(2)} kg`,
    dimensions: "20x15x10",
    hsn: "9999",
    short_description: `${s.name} — high-quality ${category.toLowerCase()} item from verified Shipflow suppliers.`,
    long_description: `${s.name}\n\nPremium quality, ready-to-ship inventory backed by Shipflow assurance. Perfect for dropshipping and resale.`,
    tags: [category.split(" ")[0], s.keywords.split(",")[0]],
    unit: "pcs",
    min_order_qty: 1,
    images: [img(s.keywords, _id)],
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
    user_id: null, vendor_id: null, vendor_name: "Shipflow Verified Supplier",
    uploaded_by_role: "vendor",
  };
};

export const MOCK_PRODUCTS: SupplierProduct[] = Object.entries(catalog).flatMap(
  ([cat, items]) => items.map((s) => make(s, cat))
);
