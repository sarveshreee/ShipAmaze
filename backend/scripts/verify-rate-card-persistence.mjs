/**
 * Verifies admin save → dropshipper read for zone rate card.
 * Usage: node backend/scripts/verify-rate-card-persistence.mjs
 * Requires backend running on PORT (default 5000).
 */
import "dotenv/config";

const BASE = process.env.API_BASE ?? "http://127.0.0.1:5000/api";
const ADMIN_EMAIL = process.env.ADMIN_TEST_EMAIL ?? "admin@admin.com";
const ADMIN_PASSWORD = process.env.ADMIN_TEST_PASSWORD ?? "admin@123";
const DS_EMAIL = process.env.DROPSHIPPER_TEST_EMAIL ?? "dropship@dropship.com";
const DS_PASSWORD = process.env.DROPSHIPPER_TEST_PASSWORD ?? "dropship@123";

const PROOF_RATE = 199.99;
const zones = ["A", "B", "C", "D", "E"];
const weights = ["0.5 kg", "1 kg", "2 kg", "5 kg", "10 kg"];

function defaultMatrix(proofValue) {
  return zones.map((_, zi) =>
    weights.map((_, wi) => (zi === 0 && wi === 0 ? proofValue : 30 + zi * 8 + wi * 15))
  );
}

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.token ?? data.accessToken ?? data.data?.token;
}

async function getRateCard(token, paymentType = "Prepaid") {
  const res = await fetch(`${BASE}/shipping-rate-card?paymentType=${paymentType}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET rate card failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function saveRateCard(token, rates) {
  const res = await fetch(`${BASE}/admin/shipping-rate-card`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ paymentType: "Prepaid", zones, weights, rates }),
  });
  if (!res.ok) throw new Error(`POST save failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log("=== Rate Card Persistence Verification ===\n");
  console.log(`API: ${BASE}`);

  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  console.log("✓ Admin login");

  const rates = defaultMatrix(PROOF_RATE);
  const saved = await saveRateCard(adminToken, rates);
  console.log(`✓ Admin saved Prepaid rate card (Zone A / 0.5 kg = ₹${saved.rates[0][0]})`);

  const dsToken = await login(DS_EMAIL, DS_PASSWORD);
  console.log("✓ Dropshipper login");

  const card = await getRateCard(dsToken, "Prepaid");
  const dsRate = card.rates?.[0]?.[0];
  console.log(`✓ Dropshipper read Zone A / 0.5 kg = ₹${dsRate}`);

  if (Number(dsRate) !== PROOF_RATE) {
    console.error(`\n✗ FAIL: expected ${PROOF_RATE}, got ${dsRate}`);
    process.exit(1);
  }

  console.log("\n✓ PASS: Dropshipper rate card reflects admin-saved values immediately.");
  console.log(`  updatedAt: ${card.updatedAt ?? saved.updatedAt ?? "n/a"}`);
}

main().catch((err) => {
  console.error("\n✗", err.message);
  process.exit(1);
});
