/**
 * Distributed lock for multi-instance sync/booking coordination.
 *
 * Strategy:
 * 1. Always acquire process-local mutex (same-process overlap).
 * 2. If REDIS_URL is set and `ioredis` is installed → Redis SET NX PX lock.
 * 3. Else → Mongo-based lock (DistributedLock collection).
 *
 * Backward compatible: single-instance deploys work with Mongo (or process-local only
 * if Mongo is unavailable during tests).
 */

import { createHash, randomUUID } from "crypto";
import mongoose, { Schema, type Model } from "mongoose";
import {
  isSyncMutexSkipResult,
  withSyncMutex,
  type SyncMutexSkipResult,
} from "./syncMutex.js";

export type DistributedLockSkipResult = SyncMutexSkipResult & {
  backend?: "process" | "redis" | "mongo";
};

interface IDistributedLock {
  _id: string;
  owner: string;
  expiresAt: Date;
}

const lockSchema = new Schema<IDistributedLock>(
  {
    _id: { type: String, required: true },
    owner: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
  },
  { collection: "distributed_locks" }
);

function getLockModel(): Model<IDistributedLock> {
  return (
    (mongoose.models.DistributedLock as Model<IDistributedLock> | undefined) ||
    mongoose.model<IDistributedLock>("DistributedLock", lockSchema)
  );
}

function ttlMsFor(name: string): number {
  const n = parseInt(process.env.DISTRIBUTED_LOCK_TTL_MS || "", 10);
  if (Number.isFinite(n) && n >= 5_000) return n;
  // Longer TTL for sync jobs that can take minutes
  if (name.includes("status") || name.includes("ndr")) return 4 * 60 * 1000;
  return 60_000;
}

function lockKey(name: string): string {
  // Keep key short & safe for Redis/Mongo _id
  const h = createHash("sha1").update(name).digest("hex").slice(0, 16);
  return `shipamaze:lock:${name}:${h}`;
}

type RedisLike = {
  set(key: string, value: string, mode: string, ttl: number, flag: string): Promise<string | null>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
  quit(): Promise<void>;
};

let redisClient: RedisLike | null | undefined;

async function getRedisClient(): Promise<RedisLike | null> {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    redisClient = null;
    return null;
  }
  try {
    // Optional dependency — install with: npm i ioredis
    const mod = await import(/* webpackIgnore: true */ "ioredis");
    const Redis = (mod as { default?: new (url: string) => RedisLike }).default ?? (mod as unknown as new (url: string) => RedisLike);
    redisClient = new Redis(url);
    console.info("[distributed-lock] using Redis backend");
    return redisClient;
  } catch (err) {
    console.warn(
      `[distributed-lock] REDIS_URL set but ioredis unavailable; falling back to Mongo (${err instanceof Error ? err.message : err})`
    );
    redisClient = null;
    return null;
  }
}

async function acquireRedisLock(key: string, owner: string, ttlMs: number): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) return false;
  const res = await client.set(key, owner, "PX", ttlMs, "NX");
  return res === "OK";
}

async function releaseRedisLock(key: string, owner: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) return;
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await client.eval(script, 1, key, owner);
}

async function acquireMongoLock(key: string, owner: string, ttlMs: number): Promise<boolean> {
  if (mongoose.connection.readyState !== 1) return false;
  const Lock = getLockModel();
  const now = new Date();
  const expiresAt = new Date(Date.now() + ttlMs);
  try {
    // Insert if missing
    await Lock.create({ _id: key, owner, expiresAt });
    return true;
  } catch {
    // Take over expired lock
    const stolen = await Lock.findOneAndUpdate(
      { _id: key, expiresAt: { $lt: now } },
      { $set: { owner, expiresAt } },
      { new: true }
    );
    return Boolean(stolen && stolen.owner === owner);
  }
}

async function releaseMongoLock(key: string, owner: string): Promise<void> {
  if (mongoose.connection.readyState !== 1) return;
  const Lock = getLockModel();
  await Lock.deleteOne({ _id: key, owner }).catch(() => undefined);
}

export async function withDistributedLock<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T | DistributedLockSkipResult> {
  // Layer 1: process-local
  const local = await withSyncMutex(name, async () => {
    const owner = randomUUID();
    const key = lockKey(name);
    const ttlMs = ttlMsFor(name);
    const redis = await getRedisClient();

    let backend: "redis" | "mongo" = "mongo";
    let acquired = false;

    if (redis) {
      backend = "redis";
      acquired = await acquireRedisLock(key, owner, ttlMs);
    } else {
      acquired = await acquireMongoLock(key, owner, ttlMs);
      // If Mongo unavailable (unit tests), allow process-local only.
      if (!acquired && mongoose.connection.readyState !== 1) {
        acquired = true;
        backend = "mongo";
        console.info(`[distributed-lock] mongo unavailable — process-local only name=${name}`);
        try {
          return await fn();
        } finally {
          /* nothing to release */
        }
      }
    }

    if (!acquired) {
      console.info(`[distributed-lock] skip name=${name} backend=${backend} reason=held_elsewhere`);
      return {
        skipped: true,
        reason: "already_running" as const,
        name,
        alreadyRunningMs: 0,
        skippedCount: 0,
        backend,
      };
    }

    console.info(`[distributed-lock] acquired name=${name} backend=${backend} ttlMs=${ttlMs}`);
    try {
      return await fn();
    } finally {
      if (backend === "redis") await releaseRedisLock(key, owner);
      else await releaseMongoLock(key, owner);
      console.info(`[distributed-lock] released name=${name} backend=${backend}`);
    }
  });

  if (isSyncMutexSkipResult(local)) {
    const nested = local as DistributedLockSkipResult;
    return { ...nested, backend: nested.backend ?? "process" };
  }
  return local as T;
}

/** Prefer this over withSyncMutex in server.ts for multi-instance safety. */
export const withSyncLock = withDistributedLock;

export function resetDistributedLockClientForTests(): void {
  redisClient = undefined;
}
