import type { ClientRateLimitInfo, Options, Store } from "express-rate-limit";
import mongoose from "mongoose";
import { PartnerRateLimitCounter } from "../../models/PartnerRateLimitCounter.js";

const STORE_LOG_PREFIX = "[partner-rate-limit-store]";

/**
 * MongoDB-backed express-rate-limit store — shared across EC2 instances.
 * Keys are the full rate-limit key from keyGenerator (partnerId / IP based, never raw API keys).
 */
export class MongoPartnerRateLimitStore implements Store {
  private windowMs = 60_000;

  init(options: Options): void {
    this.windowMs = options.windowMs;
    void PartnerRateLimitCounter.createIndexes().catch((err) => {
      console.warn(
        `${STORE_LOG_PREFIX} index ensure failed (${err instanceof Error ? err.message : err})`
      );
    });
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const doc = await PartnerRateLimitCounter.findById(key).lean();
    if (!doc) return undefined;
    const now = Date.now();
    if (doc.resetTime.getTime() <= now) return undefined;
    return { totalHits: doc.hits, resetTime: doc.resetTime };
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = new Date();
    const resetTime = new Date(now.getTime() + this.windowMs);

    try {
      const incremented = await PartnerRateLimitCounter.findOneAndUpdate(
        { _id: key, resetTime: { $gt: now } },
        { $inc: { hits: 1 } },
        { returnDocument: "after" }
      );

      if (incremented) {
        return { totalHits: incremented.hits, resetTime: incremented.resetTime };
      }

      const fresh = await PartnerRateLimitCounter.findOneAndUpdate(
        {
          _id: key,
          $or: [{ resetTime: { $exists: false } }, { resetTime: { $lte: now } }],
        },
        { $set: { hits: 1, resetTime, expiresAt: resetTime } },
        { upsert: true, returnDocument: "after" }
      );

      if (fresh) {
        return { totalHits: fresh.hits, resetTime: fresh.resetTime };
      }

      const raced = await PartnerRateLimitCounter.findOneAndUpdate(
        { _id: key, resetTime: { $gt: now } },
        { $inc: { hits: 1 } },
        { returnDocument: "after" }
      );

      if (raced) {
        return { totalHits: raced.hits, resetTime: raced.resetTime };
      }

      console.warn(`${STORE_LOG_PREFIX} increment race unresolved key=${key.slice(0, 64)}`);
      return { totalHits: 1, resetTime };
    } catch (err) {
      console.error(
        `${STORE_LOG_PREFIX} increment failed key=${key.slice(0, 64)} (${err instanceof Error ? err.message : err})`
      );
      throw err;
    }
  }

  async decrement(key: string): Promise<void> {
    const now = new Date();
    try {
      await PartnerRateLimitCounter.findOneAndUpdate(
        { _id: key, resetTime: { $gt: now }, hits: { $gt: 0 } },
        { $inc: { hits: -1 } }
      );
    } catch (err) {
      console.error(
        `${STORE_LOG_PREFIX} decrement failed key=${key.slice(0, 64)} (${err instanceof Error ? err.message : err})`
      );
      throw err;
    }
  }

  async resetKey(key: string): Promise<void> {
    await PartnerRateLimitCounter.deleteOne({ _id: key }).catch(() => undefined);
  }

  async resetAll(): Promise<void> {
    await PartnerRateLimitCounter.deleteMany({}).catch(() => undefined);
  }
}

/** In-memory store sharing a module-level map — tests only (simulates multi-instance). */
export class SharedMemoryPartnerRateLimitStore implements Store {
  static shared = new Map<string, { hits: number; resetTime: Date }>();
  private windowMs = 60_000;

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = Date.now();
    const existing = SharedMemoryPartnerRateLimitStore.shared.get(key);
    if (existing && existing.resetTime.getTime() > now) {
      existing.hits += 1;
      return { totalHits: existing.hits, resetTime: existing.resetTime };
    }
    const resetTime = new Date(now + this.windowMs);
    const entry = { hits: 1, resetTime };
    SharedMemoryPartnerRateLimitStore.shared.set(key, entry);
    return { totalHits: 1, resetTime };
  }

  async decrement(key: string): Promise<void> {
    const existing = SharedMemoryPartnerRateLimitStore.shared.get(key);
    if (existing && existing.hits > 0) existing.hits -= 1;
  }

  async resetKey(key: string): Promise<void> {
    SharedMemoryPartnerRateLimitStore.shared.delete(key);
  }

  async resetAll(): Promise<void> {
    SharedMemoryPartnerRateLimitStore.shared.clear();
  }
}

export function resetPartnerRateLimitStoresForTests(): void {
  SharedMemoryPartnerRateLimitStore.shared.clear();
}

export function isMongoReadyForPartnerRateLimits(): boolean {
  return mongoose.connection.readyState === 1;
}
