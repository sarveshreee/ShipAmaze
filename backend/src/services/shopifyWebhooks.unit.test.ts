import { describe, it, expect, vi, beforeEach } from "vitest";
import { applyDefaultTestEnv } from "../test/testEnv.js";

applyDefaultTestEnv();

vi.mock("./shopify.service.js", () => ({
  listWebhooks: vi.fn(),
  createWebhook: vi.fn(),
}));

import * as shopifyService from "./shopify.service.js";
import { ensureShopifyWebhooksRegistered } from "./shopifyWebhooks.js";

describe("ensureShopifyWebhooksRegistered", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SHOPIFY_WEBHOOK_URL = "http://localhost:5000/api/shopify/webhooks";
  });

  it("skips registration when webhook URL is not HTTPS (local dev)", async () => {
    const result = await ensureShopifyWebhooksRegistered("token", "store.myshopify.com");

    expect(result.deferredNonHttps).toBe(true);
    expect(result.registered).toEqual([]);
    expect(shopifyService.listWebhooks).not.toHaveBeenCalled();
    expect(shopifyService.createWebhook).not.toHaveBeenCalled();
  });

  it("registers only missing topics at HTTPS webhook URL", async () => {
    process.env.SHOPIFY_WEBHOOK_URL = "https://shipamaze.onrender.com/api/shopify/webhooks";

    vi.mocked(shopifyService.listWebhooks).mockResolvedValue([
      {
        id: 1,
        topic: "orders/create",
        address: "https://shipamaze.onrender.com/api/shopify/webhooks",
        format: "json",
      },
    ]);
    vi.mocked(shopifyService.createWebhook).mockImplementation(async (_t, _s, topic) => ({
      id: 99,
      topic,
      address: "https://shipamaze.onrender.com/api/shopify/webhooks",
      format: "json",
    }));

    const result = await ensureShopifyWebhooksRegistered("token", "store.myshopify.com");

    expect(result.deferredNonHttps).toBeUndefined();
    expect(result.skipped).toEqual(["orders/create"]);
    expect(result.registered).toEqual(["orders/updated", "orders/cancelled", "app/uninstalled"]);
    expect(shopifyService.createWebhook).toHaveBeenCalledTimes(3);
  });
});
