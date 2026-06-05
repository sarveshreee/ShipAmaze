import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDb, disconnectDb } from "../config/db.js";
import { User, type UserRole } from "../models/User.js";
import { Profile } from "../models/Profile.js";
import { Wallet } from "../models/Wallet.js";
import { Vendor } from "../models/Vendor.js";

type SeedUser = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  companyName?: string;
};

const USERS: SeedUser[] = [
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
];

async function upsertUser(u: SeedUser) {
  const email = u.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(u.password, 10);

  let user = await User.findOne({ email });
  const created = !user;

  if (!user) {
    user = await User.create({
      name: u.name,
      email,
      passwordHash,
      role: u.role,
      companyName: u.companyName ?? "",
      phone: "",
      permissions: [],
      status: "active",
      emailVerified: true,
    });
  } else {
    user.passwordHash = passwordHash;
    user.role = u.role;
    user.status = "active";
    user.emailVerified = true;
    user.name = u.name;
    user.companyName = u.companyName ?? user.companyName;
    await user.save();
  }

  await Profile.updateOne({ userId: user._id }, { $setOnInsert: { userId: user._id, address: "" } }, { upsert: true });
  await Wallet.updateOne(
    { userId: user._id },
    { $setOnInsert: { userId: user._id, balance: 0, currency: "INR" } },
    { upsert: true }
  );

  if (u.role === "vendor") {
    await Vendor.updateOne(
      { userId: user._id },
      {
        $setOnInsert: {
          userId: user._id,
          name: u.companyName || u.name,
          city: "",
          pin: "",
          assignedVendors: 0,
          ordersToday: 0,
          status: "Active",
        },
      },
      { upsert: true }
    );
  }

  return { user, created };
}

async function main() {
  const uri = (process.env.MONGODB_URI || "").trim();
  if (!uri) throw new Error("MONGODB_URI is required");

  await connectDb(uri);

  for (const u of USERS) {
    const { user, created } = await upsertUser(u);
    console.log(`${created ? "CREATED" : "UPDATED"} ${user.role} ${user.email} / ${u.password}`);
  }
}

void main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb().catch(() => {});
  });
