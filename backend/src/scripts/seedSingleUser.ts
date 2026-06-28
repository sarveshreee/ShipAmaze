import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDb, disconnectDb } from "../config/db.js";
import { User } from "../models/User.js";
import { Profile } from "../models/Profile.js";
import { Wallet } from "../models/Wallet.js";
import { Vendor } from "../models/Vendor.js";
import { Dropshipper } from "../models/Dropshipper.js";

const SINGLE_EMAIL = (process.env.SINGLE_LOGIN_EMAIL || "owner@shipamaze.com").trim().toLowerCase();
const SINGLE_PASSWORD = (process.env.SINGLE_LOGIN_PASSWORD || "ShipAmaze@2026!").trim();

const LEGACY_DEMO_EMAILS = ["admin@admin.com", "vendor@vendor.com", "dropship@dropship.com"];

async function removeLegacyDemoUsers(keepEmail: string) {
  const usersToDelete = await User.find({
    email: { $in: LEGACY_DEMO_EMAILS.filter((e) => e !== keepEmail) },
  }).select("_id email");

  if (!usersToDelete.length) return 0;

  const userIds = usersToDelete.map((u) => u._id);
  await Promise.all([
    Profile.deleteMany({ userId: { $in: userIds } }),
    Wallet.deleteMany({ userId: { $in: userIds } }),
    Vendor.deleteMany({ userId: { $in: userIds } }),
    Dropshipper.deleteMany({ userId: { $in: userIds } }),
    User.deleteMany({ _id: { $in: userIds } }),
  ]);

  return usersToDelete.length;
}

async function upsertSingleUser() {
  const passwordHash = await bcrypt.hash(SINGLE_PASSWORD, 10);

  let user = await User.findOne({ email: SINGLE_EMAIL });
  if (!user) {
    user = await User.create({
      name: "ShipAmaze Owner",
      email: SINGLE_EMAIL,
      passwordHash,
      role: "admin",
      companyName: "ShipAmaze",
      phone: "",
      permissions: [],
      status: "active",
      emailVerified: true,
    });
  } else {
    user.passwordHash = passwordHash;
    user.role = "admin";
    user.status = "active";
    user.emailVerified = true;
    user.name = user.name || "ShipAmaze Owner";
    user.companyName = user.companyName || "ShipAmaze";
    user.permissions = [];
    await user.save();
  }

  await Profile.updateOne({ userId: user._id }, { $setOnInsert: { userId: user._id, address: "" } }, { upsert: true });
  await Wallet.updateOne(
    { userId: user._id },
    { $setOnInsert: { userId: user._id, balance: 0, currency: "INR" } },
    { upsert: true }
  );

  return user;
}

async function main() {
  const uri = (process.env.MONGODB_URI || "").trim();
  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }

  await connectDb(uri);
  const removedCount = await removeLegacyDemoUsers(SINGLE_EMAIL);
  const user = await upsertSingleUser();

  console.log(`[single-user] removed legacy demo users: ${removedCount}`);
  console.log(`[single-user] ready: ${user.email} / ${SINGLE_PASSWORD}`);
}

void main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDb().catch(() => {});
  });
