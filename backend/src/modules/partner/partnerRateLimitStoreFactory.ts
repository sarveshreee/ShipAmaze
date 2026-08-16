import { MemoryStore, type Store } from "express-rate-limit";
import { partnerRateLimitStoreMode } from "./partnerConfig.js";
import {
  MongoPartnerRateLimitStore,
  SharedMemoryPartnerRateLimitStore,
} from "./mongoPartnerRateLimitStore.js";

/**
 * Each limiter gets its own store instance (different windowMs / prefix).
 * Mongo collection is shared so counters are global across EC2 instances.
 */
export function createPartnerRateLimitStore(): Store {
  const mode = partnerRateLimitStoreMode();
  if (mode === "memory") {
    return new MemoryStore();
  }
  if (mode === "shared-memory") {
    return new SharedMemoryPartnerRateLimitStore();
  }
  return new MongoPartnerRateLimitStore();
}
