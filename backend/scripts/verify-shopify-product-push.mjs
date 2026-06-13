/**
 * Verifies Shopify product push API wiring (requires active Shopify connection).
 * Usage: node backend/scripts/verify-shopify-product-push.mjs [productId]
 */
import "dotenv/config";

const BASE = process.env.API_BASE ?? "http://127.0.0.1:5000/api";
const DS_EMAIL = process.env.DROPSHIPPER_TEST_EMAIL ?? "dropship@dropship.com";
const DS_PASSWORD = process.env.DROPSHIPPER_TEST_PASSWORD ?? "dropship@123";

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.token ?? data.accessToken;
}

async function main() {
  const productId = process.argv[2];
  console.log("=== Shopify Product Push API Verification ===\n");

  const token = await login(DS_EMAIL, DS_PASSWORD);
  console.log("✓ Dropshipper login");

  const statusRes = await fetch(`${BASE}/shopify/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const status = await statusRes.json();
  if (!statusRes.ok) throw new Error(`Status failed: ${JSON.stringify(status)}`);

  if (!status.connected) {
    console.log("⚠ No active Shopify connection — connect a store under Channels first.");
    console.log("  GET /shopify/status → connected: false (expected when not linked)");
    process.exit(0);
  }

  console.log(`✓ Shopify connected: ${status.shopDomain}`);

  if (!productId) {
    const mp = await fetch(`${BASE}/products/marketplace`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const products = await mp.json();
    if (!Array.isArray(products) || !products.length) {
      console.log("⚠ No marketplace products found — pass a productId argument to test push.");
      process.exit(0);
    }
    const first = products[0];
    const id = String(first._id ?? first.id);
    console.log(`  Using first marketplace product: ${first.name} (${id})`);
    await runPushChecks(token, id);
    return;
  }

  await runPushChecks(token, productId);
}

async function runPushChecks(token, productId) {
  const pushStatusRes = await fetch(`${BASE}/shopify/product-push/${encodeURIComponent(productId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const pushStatus = await pushStatusRes.json();
  if (!pushStatusRes.ok) throw new Error(`Push status failed: ${JSON.stringify(pushStatus)}`);
  console.log("✓ GET /shopify/product-push/:productId", {
    connected: pushStatus.connected,
    published: pushStatus.published,
    shopifyProductId: pushStatus.shopifyProductId,
  });

  const pushRes = await fetch(`${BASE}/shopify/push-product`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ productId, sellingPrice: 599 }),
  });
  const pushResult = await pushRes.json();
  if (!pushRes.ok) {
    console.error("✗ POST /shopify/push-product failed:", pushResult.message ?? pushResult);
    process.exit(1);
  }

  console.log("✓ POST /shopify/push-product", pushResult);
  console.log("\n✓ PASS — verify product in Shopify Admin → Products");
}

main().catch((err) => {
  console.error("\n✗", err.message);
  process.exit(1);
});
