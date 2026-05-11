import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Express } from "express";
import { applyDefaultTestEnv } from "./test/testEnv.js";
import { createApp } from "./app.js";

beforeAll(() => {
  applyDefaultTestEnv();
});

function webhookHmac(raw: Buffer, secret: string): string {
  return createHmac("sha256", secret).update(raw).digest("base64");
}

async function postRawWebhook(
  app: Express,
  path: string,
  raw: Buffer,
  headers: Record<string, string>
): Promise<{ status: number; text: string }> {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(0, () => resolve());
    server.on("error", reject);
  });
  const addr = server.address() as AddressInfo;
  const port = addr.port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(raw.length),
        ...headers,
      },
      body: raw,
    });
    const text = await res.text();
    return { status: res.status, text };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

describe("Shopify webhook HMAC", () => {
  it("rejects missing or invalid HMAC", async () => {
    const app = createApp();
    const raw = Buffer.from(JSON.stringify({ hello: "world" }), "utf8");
    const bad = await request(app)
      .post("/api/shopify/webhooks")
      .set("Content-Type", "application/json")
      .set("X-Shopify-Topic", "themes/update")
      .set("X-Shopify-Shop-Domain", "test.myshopify.com")
      .send(raw);
    expect(bad.status).toBe(401);

    const wrong = await request(app)
      .post("/api/shopify/webhooks")
      .set("Content-Type", "application/json")
      .set("X-Shopify-Hmac-Sha256", "not-valid-base64-signature")
      .set("X-Shopify-Topic", "themes/update")
      .set("X-Shopify-Shop-Domain", "test.myshopify.com")
      .send(raw);
    expect(wrong.status).toBe(401);
  });

  it("accepts valid HMAC for a non-order topic (raw body)", async () => {
    const app = createApp();
    const secret = process.env.SHOPIFY_API_SECRET!;
    const payload = { ping: true };
    const raw = Buffer.from(JSON.stringify(payload), "utf8");
    const hmac = webhookHmac(raw, secret);

    const { status, text } = await postRawWebhook(app, "/api/shopify/webhooks", raw, {
      "X-Shopify-Hmac-Sha256": hmac,
      "X-Shopify-Topic": "themes/update",
      "X-Shopify-Shop-Domain": "test.myshopify.com",
      "X-Shopify-Webhook-Id": "test-webhook-id-1",
    });

    expect(status).toBe(200);
    expect(text).toContain("OK");
  });
});
