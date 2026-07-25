import mongoose from "mongoose";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function intEnv(name: string, fallback: number): number {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function connectDb(uri: string, opts?: { maxAttempts?: number }): Promise<void> {
  const maxAttempts = opts?.maxAttempts ?? Number(process.env.MONGODB_CONNECT_RETRIES ?? 8);
  mongoose.set("strictQuery", true);

  const connectOpts: mongoose.ConnectOptions = {
    maxPoolSize: intEnv("MONGODB_MAX_POOL_SIZE", 20),
    minPoolSize: intEnv("MONGODB_MIN_POOL_SIZE", 2),
    serverSelectionTimeoutMS: intEnv("MONGODB_SERVER_SELECTION_TIMEOUT_MS", 10_000),
    maxIdleTimeMS: intEnv("MONGODB_MAX_IDLE_TIME_MS", 60_000),
    socketTimeoutMS: intEnv("MONGODB_SOCKET_TIMEOUT_MS", 45_000),
  };

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await mongoose.connect(uri, connectOpts);
      console.info(
        `[db] MongoDB connected pool max=${connectOpts.maxPoolSize} min=${connectOpts.minPoolSize}`
      );
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
