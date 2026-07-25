import { beforeEach, describe, expect, it } from "vitest";
import {
  resetDistributedLockClientForTests,
  withDistributedLock,
} from "./distributedLock.js";
import { isSyncMutexSkipResult, resetSyncMutexForTests } from "./syncMutex.js";

describe("distributed lock", () => {
  beforeEach(() => {
    resetSyncMutexForTests();
    resetDistributedLockClientForTests();
    delete process.env.REDIS_URL;
  });

  it("runs the critical section once under process+mongo fallback", async () => {
    const result = await withDistributedLock("unit:job", async () => ({ ok: true }));
    expect(isSyncMutexSkipResult(result)).toBe(false);
    expect(result).toEqual({ ok: true });
  });

  it("skips overlapping process-local acquisition", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const first = withDistributedLock("unit:overlap", async () => {
      await gate;
      return 1;
    });

    await new Promise((r) => setTimeout(r, 10));
    const second = await withDistributedLock("unit:overlap", async () => 2);
    expect(isSyncMutexSkipResult(second)).toBe(true);

    release();
    expect(await first).toBe(1);
  });
});
