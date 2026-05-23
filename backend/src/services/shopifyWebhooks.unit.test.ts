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
  });

  it("registers only missing topics at our webhook URL", async () => {
    vi.mocked(shopifyService.listWebhooks).mockResolvedValue([
      {
        id: 1,
        topic: "orders/create",
        address: "http://localhost:5000/api/shopify/webhooks",
        format: "json",
      },
    ]);
    vi.mocked(shopifyService.createWebhook).mockImplementation(async (_t, _s, topic) => ({
      id: 99,
      topic,
      address: "http://localhost:5000/api/shopify/webhooks",
      format: "json",
    }));

    const result = await ensureShopifyWebhooksRegistered("token", "store.myshopify.com");

    expect(result.skipped).toEqual(["orders/create"]);
    expect(result.registered).toEqual(["orders/updated", "orders/cancelled", "app/uninstalled"]);
    expect(shopifyService.createWebhook).toHaveBeenCalledTimes(3);
    expect(shopifyService.createWebhook).toHaveBeenCalledWith(
      "token",
      "store.myshopify.com",
      "orders/updated",
      "http://localhost:5000/api/shopify/webhooks"
    );
  });
});
