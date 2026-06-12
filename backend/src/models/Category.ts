import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface ICategory extends Document {
  name: string;
  slug: string;
  emoji?: string;
  imageUrl?: string;
  displayOrder: number;
  enabled: boolean;
  defaultHsn?: string;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    emoji: { type: String, default: "" },
    imageUrl: { type: String, default: "" },
    displayOrder: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
    defaultHsn: { type: String, default: "" },
  },
  { timestamps: true }
);

categorySchema.index({ enabled: 1, displayOrder: 1 });

export const Category: Model<ICategory> =
  mongoose.models.Category || mongoose.model<ICategory>("Category", categorySchema);

export const DEFAULT_CATEGORIES = [
  { name: "Extreme Profitable Products", slug: "extreme-profitable", emoji: "🔥", displayOrder: 1, enabled: true, defaultHsn: "" },
  { name: "Gardening Products", slug: "gardening", emoji: "🌱", displayOrder: 2, enabled: true, defaultHsn: "" },
  { name: "Accessories", slug: "accessories", emoji: "👜", displayOrder: 3, enabled: true, defaultHsn: "" },
  { name: "Gym & Wellness", slug: "gym-wellness", emoji: "💪", displayOrder: 4, enabled: true, defaultHsn: "9506" },
  { name: "Men", slug: "men", emoji: "👔", displayOrder: 5, enabled: true, defaultHsn: "6109" },
  { name: "Beauty & Personal Care", slug: "beauty", emoji: "💄", displayOrder: 6, enabled: true, defaultHsn: "3304" },
  { name: "Car & Bike Accessories", slug: "auto", emoji: "🚗", displayOrder: 7, enabled: true, defaultHsn: "8708" },
  { name: "Home and Living", slug: "home-living", emoji: "🛋️", displayOrder: 8, enabled: true, defaultHsn: "7323" },
  { name: "Testing Products", slug: "testing", emoji: "🔬", displayOrder: 9, enabled: true, defaultHsn: "" },
  { name: "Kids", slug: "kids", emoji: "🧸", displayOrder: 10, enabled: true, defaultHsn: "9503" },
  { name: "Apparel", slug: "apparel", emoji: "👕", displayOrder: 11, enabled: true, defaultHsn: "6109" },
  { name: "Electronics", slug: "electronics", emoji: "📱", displayOrder: 12, enabled: true, defaultHsn: "8517" },
  { name: "Home & Kitchen", slug: "home-kitchen", emoji: "🍳", displayOrder: 13, enabled: true, defaultHsn: "7323" },
  { name: "Beauty", slug: "beauty-general", emoji: "✨", displayOrder: 14, enabled: true, defaultHsn: "3304" },
  { name: "Sports", slug: "sports", emoji: "⚽", displayOrder: 15, enabled: true, defaultHsn: "9506" },
  { name: "Toys", slug: "toys", emoji: "🎮", displayOrder: 16, enabled: true, defaultHsn: "9503" },
  { name: "Books", slug: "books", emoji: "📚", displayOrder: 17, enabled: true, defaultHsn: "4901" },
  { name: "Automotive", slug: "automotive", emoji: "🔧", displayOrder: 18, enabled: true, defaultHsn: "8708" },
  { name: "Arts & Entertainment", slug: "arts-entertainment", emoji: "🎨", displayOrder: 19, enabled: true, defaultHsn: "9701" },
];
