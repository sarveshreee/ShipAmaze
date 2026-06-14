/**
 * Phase 0 — read-only Velocity warehouse endpoint discovery.
 *
 * Does NOT modify ShipAmaze data or call warehouse CREATE with real payloads.
 * Probes candidate lookup/list/validate endpoints and prints status + sanitized bodies.
 *
 * Usage (from backend/):
 *   node scripts/velocityWarehouseDiscovery.mjs
 *   VELOCITY_PROBE_WAREHOUSE_ID=WHBRR node scripts/velocityWarehouseDiscovery.mjs
 *
 * Optional:
 *   VELOCITY_DISCOVERY_BASE_URL=https://shazam.velocity.in  (overrides VELOCITY_BASE_URL)
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const API_HOST_DEFAULT = "https://shazam.velocity.in";
const configuredBase = (process.env.VELOCITY_DISCOVERY_BASE_URL || process.env.VELOCITY_BASE_URL || API_HOST_DEFAULT)
  .trim()
  .replace(/\/$/, "");

const probeCode = (process.env.VELOCITY_PROBE_WAREHOUSE_ID || "WHBRR").trim().toUpperCase();
const username = process.env.VELOCITY_USERNAME?.trim() || "";
const password = process.env.VELOCITY_PASSWORD?.trim() || "";
const timeoutMs = Number(process.env.VELOCITY_REQUEST_TIMEOUT_MS || 30_000);

function truncate(s, max = 600) {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function sanitizeBody(data) {
  if (data === null || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.slice(0, 5).map(sanitizeBody);
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    const kl = k.toLowerCase();
    if (kl.includes("token") || kl.includes("password")) {
      out[k] = "***";
      continue;
    }
    out[k] = typeof v === "object" ? sanitizeBody(v) : v;
  }
  return out;
}

async function fetchJson(url, init) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { _raw: truncate(text, 800) };
    }
    return { status: res.status, ok: res.ok, body: json };
  } finally {
    clearTimeout(t);
  }
}

async function getToken(baseUrl) {
  const url = `${baseUrl}/custom/api/v1/auth-token`;
  const res = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    return { error: `auth failed ${res.status}: ${truncate(JSON.stringify(res.body))}`, token: null };
  }
  const token = res.body?.token;
  if (!token) return { error: "auth ok but no token in body", token: null };
  return { token, error: null };
}

/** Candidate endpoints — read-only / lookup probes only (no warehouse create payloads). */
function candidateProbes(warehouseId) {
  return [
    { label: "GET warehouse by id (singular path)", method: "GET", path: `/custom/api/v1/warehouse/${encodeURIComponent(warehouseId)}`, body: null },
    { label: "POST warehouses list (plural)", method: "POST", path: "/custom/api/v1/warehouses", body: { page: 1, per_page: 50 } },
    { label: "POST warehouse list (hyphen)", method: "POST", path: "/custom/api/v1/warehouse-list", body: { page: 1, per_page: 50 } },
    { label: "POST warehouse details", method: "POST", path: "/custom/api/v1/warehouse-details", body: { warehouse_id: warehouseId } },
    { label: "POST get-warehouse", method: "POST", path: "/custom/api/v1/get-warehouse", body: { warehouse_id: warehouseId } },
    { label: "POST warehouse lookup", method: "POST", path: "/custom/api/v1/warehouse-lookup", body: { warehouse_id: warehouseId } },
    { label: "POST validate warehouse", method: "POST", path: "/custom/api/v1/validate-warehouse", body: { warehouse_id: warehouseId } },
    { label: "POST warehouse (id-only body — not create)", method: "POST", path: "/custom/api/v1/warehouse", body: { warehouse_id: warehouseId } },
    { label: "POST rates with warehouse_id", method: "POST", path: "/custom/api/v1/rates", body: {
      journey_type: "forward",
      warehouse_id: warehouseId,
      origin_pincode: "110001",
      destination_pincode: "400001",
      dead_weight: 0.5,
      length: 10,
      width: 10,
      height: 10,
      payment_method: "prepaid",
    }},
    { label: "POST serviceability with warehouse_id", method: "POST", path: "/custom/api/v1/serviceability", body: {
      warehouse_id: warehouseId,
      from: "110001",
      to: "400001",
      payment_mode: "prepaid",
      shipment_type: "forward",
    }},
  ];
}

async function probeEndpoint(baseUrl, token, probe) {
  const url = `${baseUrl}${probe.path}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const init =
    probe.method === "GET"
      ? { method: "GET", headers }
      : { method: "POST", headers, body: JSON.stringify(probe.body ?? {}) };

  const res = await fetchJson(url, init);
  return {
    ...probe,
    url,
    status: res.status,
    ok: res.ok,
    body: sanitizeBody(res.body),
  };
}

function extractWarehouseIds(body, found = new Set()) {
  if (body === null || typeof body !== "object") return found;
  if (Array.isArray(body)) {
    for (const item of body) extractWarehouseIds(item, found);
    return found;
  }
  for (const [k, v] of Object.entries(body)) {
    if (typeof v === "string" && /^WH[A-Z0-9]+$/i.test(v)) found.add(v.toUpperCase());
    if (k.toLowerCase().includes("warehouse_id") && (typeof v === "string" || typeof v === "number")) {
      found.add(String(v).toUpperCase());
    }
    if (typeof v === "object") extractWarehouseIds(v, found);
  }
  return found;
}

async function runForBase(baseUrl) {
  console.log(`\n========== Base URL: ${baseUrl} ==========`);
  if (!username || !password) {
    console.log("SKIP: VELOCITY_USERNAME / VELOCITY_PASSWORD not set in backend/.env");
    return null;
  }

  const auth = await getToken(baseUrl);
  if (!auth.token) {
    console.log(`AUTH: FAILED — ${auth.error}`);
    return null;
  }
  console.log("AUTH: OK (token received)");

  const results = [];
  for (const probe of candidateProbes(probeCode)) {
    const r = await probeEndpoint(baseUrl, auth.token, probe);
    results.push(r);
    const ids = [...extractWarehouseIds(r.body)];
    const idHint = ids.length ? ` | warehouse_ids in response: ${ids.join(", ")}` : "";
    const matchHint = ids.includes(probeCode) ? " | MATCHES_PROBE_CODE" : "";
    console.log(
      `[${r.status}] ${r.method} ${r.path} — ${r.label}${idHint}${matchHint}`
    );
    if (r.status !== 404 && r.status !== 405) {
      console.log(`     body: ${truncate(JSON.stringify(r.body), 400)}`);
    }
  }

  const promising = results.filter((r) => r.ok || (r.status >= 200 && r.status < 300));
  const authErrors = results.filter((r) => r.status === 401);
  const notFound = results.filter((r) => r.status === 404);

  return { baseUrl, results, promising, authErrors, notFound };
}

console.log("Velocity Warehouse Discovery — Phase 0 (read-only)");
console.log(`Configured VELOCITY_BASE_URL: ${configuredBase}`);
console.log(`Probe warehouse_id: ${probeCode}`);
console.log(`Also testing API host default: ${API_HOST_DEFAULT}`);

const bases = [...new Set([configuredBase, API_HOST_DEFAULT])];
const summaries = [];
for (const b of bases) {
  summaries.push(await runForBase(b));
}

console.log("\n========== SUMMARY ==========");
for (const s of summaries) {
  if (!s) continue;
  console.log(`\n${s.baseUrl}:`);
  console.log(`  Total probes: ${s.results.length}`);
  console.log(`  2xx responses: ${s.promising.length}`);
  console.log(`  404 responses: ${s.notFound.length}`);
  if (s.promising.length) {
    console.log("  Potentially useful endpoints:");
    for (const p of s.promising) {
      console.log(`    - ${p.method} ${p.path} (${p.status}) — ${p.label}`);
    }
  } else {
    console.log("  No successful lookup/list probe found.");
  }
}

console.log("\nDone. No ShipAmaze or Velocity warehouse data was modified.");
