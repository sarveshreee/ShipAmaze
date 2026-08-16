/**
 * Prepares an isolated MongoDB database for backend integration tests.
 * Drops the target database (test-only URI) and syncs indexes required for Partner API verification.
 */
import mongoose from "mongoose";
import { connectDb } from "../config/db.js";
import { Order } from "../models/Order.js";
import { PartnerIdempotencyRecord } from "../models/PartnerIdempotencyRecord.js";

/** Extract database name from a Mongo connection URI (best-effort). */
export function extractMongoDatabaseName(uri: string): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed.replace(/^mongodb(\+srv)?:\/\//, "http://"));
    const path = parsed.pathname.replace(/^\//, "").split("?")[0];
    return path || null;
  } catch {
    const withoutQuery = trimmed.split("?")[0] ?? trimmed;
    const slash = withoutQuery.lastIndexOf("/");
    if (slash === -1) return null;
    const name = withoutQuery.slice(slash + 1);
    return name || null;
  }
}

/**
 * Ensures MONGODB_URI_TEST targets a dedicated test database — never production.
 * Throws if the URI is missing, matches MONGODB_URI, or lacks a test database name.
 */
export function assertIntegrationTestMongoUri(uri: string): void {
  const trimmed = uri.trim();
  if (!trimmed) {
    throw new Error("MONGODB_URI_TEST is empty");
  }

  const productionUri = String(process.env.MONGODB_URI ?? "").trim();
  if (productionUri && trimmed === productionUri) {
    throw new Error("MONGODB_URI_TEST must not be identical to MONGODB_URI");
  }

  const dbName = extractMongoDatabaseName(trimmed);
  if (!dbName) {
    throw new Error(
      "MONGODB_URI_TEST must include a database name (e.g. mongodb://127.0.0.1:27017/shipamaze_test)"
    );
  }

  const lower = dbName.toLowerCase();
  if (!lower.includes("test")) {
    throw new Error(
      `MONGODB_URI_TEST database "${dbName}" must contain "test" (e.g. shipamaze_test)`
    );
  }
}

/**
 * Connect, drop the test database, and sync integration-critical indexes on a clean database.
 */
export async function prepareCleanIntegrationTestDb(uri: string): Promise<void> {
  assertIntegrationTestMongoUri(uri);
  await connectDb(uri, { maxAttempts: 3 });
  await mongoose.connection.dropDatabase();
  await Order.syncIndexes();
  await PartnerIdempotencyRecord.syncIndexes();
  // Transaction index uses partialFilterExpression with $nin — do not sync here (schema unchanged).
}

/** List index metadata for integration verification (no credentials). */
export async function listIntegrationTestIndexes(): Promise<{
  orders: Array<{ name: string; key: Record<string, number>; unique?: boolean; sparse?: boolean }>;
  partnerIdempotency: Array<{
    name: string;
    key: Record<string, number>;
    unique?: boolean;
    expireAfterSeconds?: number;
  }>;
  transactions: Array<{
    name: string;
    key: Record<string, number>;
    unique?: boolean;
    partialFilterExpression?: Record<string, unknown>;
  }>;
}> {
  const conn = mongoose.connection;

  async function safeIndexes(collectionName: string) {
    try {
      return await conn.collection(collectionName).indexes();
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 26) return [];
      throw err;
    }
  }

  const orders = await safeIndexes("orders");
  const partnerIdempotency = await safeIndexes("partneridempotencyrecords");
  const transactions = await safeIndexes("transactions");

  return {
    orders: orders.map((idx) => ({
      name: idx.name ?? "_id_",
      key: idx.key as Record<string, number>,
      unique: idx.unique,
      sparse: idx.sparse,
    })),
    partnerIdempotency: partnerIdempotency.map((idx) => ({
      name: idx.name ?? "_id_",
      key: idx.key as Record<string, number>,
      unique: idx.unique,
      expireAfterSeconds: idx.expireAfterSeconds,
    })),
    transactions: transactions.map((idx) => ({
      name: idx.name ?? "_id_",
      key: idx.key as Record<string, number>,
      unique: idx.unique,
      partialFilterExpression: idx.partialFilterExpression as Record<string, unknown> | undefined,
    })),
  };
}
