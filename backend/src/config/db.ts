import mongoose from "mongoose";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function connectDb(uri: string, opts?: { maxAttempts?: number }): Promise<void> {
  const maxAttempts = opts?.maxAttempts ?? Number(process.env.MONGODB_CONNECT_RETRIES ?? 8);
  mongoose.set("strictQuery", true);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await mongoose.connect(uri);
      return;
    } catch (e) {
      lastErr = e;
      if (attempt === maxAttempts) break;
      const delay = Math.min(2000 * attempt, 15_000);
      console.warn(`[db] MongoDB connect attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
  console.error("[db] MongoDB connection failed after all retries");
  throw lastErr;
}

export async function disconnectDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close(false);
  }
}
