import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDb } from "../config/db.js";
import { User, type UserRole } from "../models/User.js";
import { Profile } from "../models/Profile.js";
import { Wallet } from "../models/Wallet.js";
import { Vendor } from "../models/Vendor.js";
import { Dropshipper } from "../models/Dropshipper.js";

type SeedUser = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  companyName?: string;
  phone?: string;
};

const SEED_USERS: SeedUser[] = [
  {
    name: "Admin",
    email: "admin@admin.com",
    password: "admin@123",
    role: "admin",
    companyName: "ShipAmaze Admin",
  },
  {
    name: "Vendor",
    email: "vendor@vendor.com",
    password: "vendor@123",
    role: "vendor",
    companyName: "Vendor Company",
  },
  {
    name: "Dropshipper",
    email: "dropship@dropship.com",
    password: "dropship@123",
    role: "dropshipper",
    companyName: "Dropshipper Company",
  },
];

async function ensureUser(u: SeedUser) {
  const existing = await User.findOne({ email: u.email });
  if (existing) {
    if (u.role === "admin" && existing.permissions.length > 0) {
      existing.permissions = [];
      await existing.save();
    }
    return { user: existing, created: false };
  }

  const passwordHash = await bcrypt.hash(u.password, 10);
  const user = await User.create({
    name: u.name,
    email: u.email,
    passwordHash,
    role: u.role,
    companyName: u.companyName ?? "",
    phone: u.phone ?? "",
    permissions: [],
    status: "active",
    emailVerified: true,
  });

  await Profile.create({ userId: user._id });
  await Wallet.create({ userId: user._id, balance: 0, currency: "INR" });

  if (u.role === "vendor") {
    await Vendor.create({
      userId: user._id,
      name: u.companyName || u.name,
      city: "",
      pin: "",
      assignedVendors: 0,
      ordersToday: 0,
      status: "Active",
    });
  }

  if (u.role === "dropshipper") {
    await Dropshipper.create({
      userId: user._id,
      totalOrders: 0,
      activeOrders: 0,
      kycVerified: false,
      joinDate: new Date(),
    });
  }

  return { user, created: true };
}

async function main() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/shipamaze";
  await connectDb(uri);

  const results = [];
  for (const u of SEED_USERS) {
    results.push(await ensureUser(u));
  }

  for (const r of results) {
    console.log(`${r.created ? "CREATED" : "EXISTS"} ${r.user.role} ${r.user.email}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

