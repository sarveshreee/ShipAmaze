/**
 * Process-local sync mutex — prevents overlapping status/NDR background jobs.
 * For multi-instance deploys, prefer an external lock; this still prevents
 * single-process overlap (the common Render single-instance case).
 */

export type SyncMutexSkipResult = {
  skipped: true;
  reason: "already_running";
  name: string;
  alreadyRunningMs: number;
  skippedCount: number;
};

type LockState = { acquiredAt: number };

const locks = new Map<string, LockState>();
const skippedCounts = new Map<string, number>();

export function getSyncMutexSkippedCount(name: string): number {
  return skippedCounts.get(name) ?? 0;
}

export function isSyncMutexHeld(name: string): boolean {
  return locks.has(name);
}

export function getSyncMutexSnapshot(): Record<
  string,
  { held: boolean; acquiredAt: string | null; skippedCount: number; heldMs: number | null }
> {
  const names = new Set([...locks.keys(), ...skippedCounts.keys()]);
  const out: Record<
    string,
    { held: boolean; acquiredAt: string | null; skippedCount: number; heldMs: number | null }
  > = {};
  for (const name of names) {
    const lock = locks.get(name);
    out[name] = {
      held: !!lock,
      acquiredAt: lock ? new Date(lock.acquiredAt).toISOString() : null,
      skippedCount: skippedCounts.get(name) ?? 0,
      heldMs: lock ? Date.now() - lock.acquiredAt : null,
    };
  }
  return out;
}

export async function withSyncMutex<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T | SyncMutexSkipResult> {
  const existing = locks.get(name);
  if (existing) {
    const skippedCount = (skippedCounts.get(name) ?? 0) + 1;
    skippedCounts.set(name, skippedCount);
    const alreadyRunningMs = Date.now() - existing.acquiredAt;
    console.info(
      `[sync-mutex] skip name=${name} reason=already_running alreadyRunningMs=${alreadyRunningMs} skippedCount=${skippedCount}`
    );
    return {
      skipped: true,
      reason: "already_running",
      name,
      alreadyRunningMs,
      skippedCount,
    };
  }

  const acquiredAt = Date.now();
  locks.set(name, { acquiredAt });
  console.info(`[sync-mutex] acquired name=${name} at=${new Date(acquiredAt).toISOString()}`);
  try {
    return await fn();
  } finally {
    locks.delete(name);
    console.info(
      `[sync-mutex] released name=${name} heldMs=${Date.now() - acquiredAt}`
    );
  }
}

export function resetSyncMutexForTests(): void {
  locks.clear();
  skippedCounts.clear();
}

export function isSyncMutexSkipResult(v: unknown): v is SyncMutexSkipResult {
  return Boolean(v && typeof v === "object" && (v as SyncMutexSkipResult).skipped === true);
}
