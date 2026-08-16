/**
 * STAGING INFRASTRUCTURE GATE
 *
 * Read-only. No wallet / remittance / payout / webhook / courier / concurrency work.
 * Exits non-zero and prints STAGING INFRASTRUCTURE: BLOCKED on any failure.
 *
 * Required env:
 *   STAGING_API_BASE              Origin only (e.g. https://staging-api.example.com) — never production
 *   STAGING_EXPECTED_COMMIT       Deployed hardening git SHA (full or prefix)
 *   STAGING_EMAIL / STAGING_PASSWORD
 *   STAGING_ORDER_ID              Valid staging order for finance snapshot
 *   STAGING_FRONTEND_URL
 *   STAGING_FRONTEND_API_BASE     Must match STAGING_API_BASE (attests FE points at staging API)
 *   STAGING_EXPECTED_MONGO_DB     Staging database name returned by /api/health
 *   STAGING_PRODUCTION_MONGO_DB   Known production DB name — must differ from staging
 *
 * Optional:
 *   STAGING_ALLOW_NODE_ENV_PRODUCTION=true  Staging hosts often run NODE_ENV=production;
 *                                           DEPLOYMENT_ENV/APP_ENV must still be staging/non-prod.
 *
 * Usage:
 *   npx tsx src/scripts/stagingInfrastructureGate.ts
 */

type GateStatus = "PASS" | "FAIL" | "SKIPPED";

type Check = {
  id: string;
  status: GateStatus;
  detail: string;
};

const BLOCKED_API_HOSTS = new Set([
  "api.shipamaze.com",
  "www.api.shipamaze.com",
  "shipamaze.onrender.com",
  "www.shipamaze.com",
  "shipamaze.com",
]);

const PRODUCTION_ENV_VALUES = new Set(["production", "prod", "live"]);
const STAGING_ENV_VALUES = new Set([
  "staging",
  "stage",
  "non-production",
  "nonprod",
  "non_production",
  "preview",
  "development",
  "dev",
]);

function env(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function normalizeOrigin(raw: string): string {
  return raw.replace(/\/+$/, "");
}

/** STAGING_API_BASE is the origin; paths are always `${origin}/api/...`. */
function apiUrl(origin: string, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${origin}/api${p.startsWith("/api/") ? p.slice(4) : p}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function commitsMatch(actual: string | null | undefined, expected: string): boolean {
  const a = String(actual ?? "").trim().toLowerCase();
  const e = expected.trim().toLowerCase();
  if (!a || !e) return false;
  return a === e || a.startsWith(e) || e.startsWith(a);
}

function printGateSummary(fields: Record<string, string>, blocked: boolean, checks: Check[]) {
  console.log("");
  console.log("ENVIRONMENT:", fields.ENVIRONMENT);
  console.log("API_URL:", fields.API_URL);
  console.log("API_COMMIT:", fields.API_COMMIT);
  console.log("EXPECTED_COMMIT:", fields.EXPECTED_COMMIT);
  console.log("FINANCE_ENDPOINT_STATUS:", fields.FINANCE_ENDPOINT_STATUS);
  console.log("AUTH_STATUS:", fields.AUTH_STATUS);
  console.log("DATABASE_ENVIRONMENT:", fields.DATABASE_ENVIRONMENT);
  console.log("TIMESTAMP:", fields.TIMESTAMP);
  console.log("");
  for (const c of checks) {
    console.log(`[${c.status}] ${c.id}: ${c.detail}`);
  }
  console.log("");
  if (blocked) {
    console.log("STAGING INFRASTRUCTURE: BLOCKED");
  } else {
    console.log("STAGING INFRASTRUCTURE: PASS");
    console.log(
      "Mutating staging validation (wallet/remittance/payout/webhooks/courier/concurrency) may proceed."
    );
  }
}

async function main() {
  const timestamp = new Date().toISOString();
  const checks: Check[] = [];
  const fields: Record<string, string> = {
    ENVIRONMENT: "UNKNOWN",
    API_URL: "UNSET",
    API_COMMIT: "UNKNOWN",
    EXPECTED_COMMIT: "UNSET",
    FINANCE_ENDPOINT_STATUS: "NOT_CHECKED",
    AUTH_STATUS: "NOT_CHECKED",
    DATABASE_ENVIRONMENT: "UNKNOWN",
    TIMESTAMP: timestamp,
  };

  const fail = (id: string, detail: string) => {
    checks.push({ id, status: "FAIL", detail });
  };
  const pass = (id: string, detail: string) => {
    checks.push({ id, status: "PASS", detail });
  };

  const blockAndExit = () => {
    printGateSummary(fields, true, checks);
    process.exit(2);
  };

  // --- 1. STAGING_API_BASE required; never default ---
  const expectedCommit = env("STAGING_EXPECTED_COMMIT");
  fields.EXPECTED_COMMIT = expectedCommit || "UNSET";

  const rawBase = env("STAGING_API_BASE");
  if (!rawBase) {
    fail(
      "STAGING_API_BASE",
      "Required. Must be set explicitly. Never defaults to production or api.shipamaze.com."
    );
    blockAndExit();
    return;
  }

  // Reject accidental "/api" suffix confusion by normalizing to origin
  let origin = normalizeOrigin(rawBase);
  if (origin.toLowerCase().endsWith("/api")) {
    origin = normalizeOrigin(origin.slice(0, -4));
  }
  fields.API_URL = origin;

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    fail("STAGING_API_BASE", `Invalid URL: ${rawBase}`);
    blockAndExit();
    return;
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    fail("STAGING_API_BASE", `Unsupported protocol: ${parsed.protocol}`);
    blockAndExit();
    return;
  }

  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_API_HOSTS.has(host)) {
    fail(
      "production_host_block",
      `Refusing production/default host "${host}". Provide a dedicated staging API origin.`
    );
    blockAndExit();
    return;
  }
  if (host.includes("api.shipamaze.com") || host === "shipamaze.com") {
    fail("production_host_block", `Refusing host "${host}".`);
    blockAndExit();
    return;
  }
  pass("STAGING_API_BASE", `Using staging origin ${origin}`);

  // --- Expected commit required (hardening build) ---
  if (!expectedCommit) {
    fail(
      "STAGING_EXPECTED_COMMIT",
      "Required. Set to the hardening build git SHA that must be deployed on staging."
    );
    blockAndExit();
    return;
  }
  pass("STAGING_EXPECTED_COMMIT", expectedCommit);

  // --- 3–6. Health ---
  const healthUrl = apiUrl(origin, "/health");
  let healthBody: {
    ok?: boolean;
    gitCommit?: string | null;
    environment?: string | null;
    nodeEnv?: string | null;
    mongo?: { readyState?: number; dbName?: string | null };
  } = {};

  try {
    const res = await fetch(healthUrl, { method: "GET" });
    const text = await res.text();
    try {
      healthBody = JSON.parse(text) as typeof healthBody;
    } catch {
      fail("health", `Non-JSON response HTTP ${res.status}: ${text.slice(0, 120)}`);
      blockAndExit();
      return;
    }
    if (!res.ok) {
      fail("health", `GET ${healthUrl} → HTTP ${res.status}`);
      blockAndExit();
      return;
    }
    pass("health", `GET ${healthUrl} → HTTP ${res.status}`);
  } catch (e) {
    fail("health", e instanceof Error ? e.message : String(e));
    blockAndExit();
    return;
  }

  const apiCommit = String(healthBody.gitCommit ?? "").trim() || null;
  fields.API_COMMIT = apiCommit ?? "MISSING";
  fields.ENVIRONMENT = String(healthBody.environment ?? "").trim() || "MISSING";

  console.log(
    JSON.stringify(
      {
        gate: "staging-infrastructure",
        recorded: {
          API_URL: origin,
          gitCommit: apiCommit,
          environment: healthBody.environment ?? null,
          nodeEnv: healthBody.nodeEnv ?? null,
          timestamp,
        },
      },
      null,
      2
    )
  );

  // --- 5. Environment must be explicitly staging/non-production ---
  const deploymentEnv = String(healthBody.environment ?? "")
    .trim()
    .toLowerCase();
  if (!deploymentEnv) {
    fail(
      "environment",
      "Health did not return environment. Staging must set DEPLOYMENT_ENV or APP_ENV (e.g. staging)."
    );
    blockAndExit();
    return;
  }
  if (PRODUCTION_ENV_VALUES.has(deploymentEnv)) {
    fail("environment", `Refusing environment="${deploymentEnv}" (production).`);
    blockAndExit();
    return;
  }
  if (!STAGING_ENV_VALUES.has(deploymentEnv)) {
    fail(
      "environment",
      `environment="${deploymentEnv}" is not an allowed staging/non-production value.`
    );
    blockAndExit();
    return;
  }
  const nodeEnv = String(healthBody.nodeEnv ?? "").trim().toLowerCase();
  if (
    PRODUCTION_ENV_VALUES.has(nodeEnv) &&
    env("STAGING_ALLOW_NODE_ENV_PRODUCTION").toLowerCase() !== "true"
  ) {
    fail(
      "nodeEnv",
      `nodeEnv="${nodeEnv}". Set STAGING_ALLOW_NODE_ENV_PRODUCTION=true only if DEPLOYMENT_ENV is staging and this is intentional.`
    );
    blockAndExit();
    return;
  }
  pass("environment", `environment=${deploymentEnv} nodeEnv=${nodeEnv || "unset"}`);

  // --- 6. Hardening commit ---
  if (!apiCommit) {
    fail(
      "commit",
      "Health gitCommit missing. Staging must set RENDER_GIT_COMMIT or GIT_COMMIT to the hardening SHA."
    );
    blockAndExit();
    return;
  }
  if (!commitsMatch(apiCommit, expectedCommit)) {
    fail(
      "commit",
      `Deployed commit "${apiCommit}" does not match STAGING_EXPECTED_COMMIT "${expectedCommit}". Hardening build not confirmed.`
    );
    blockAndExit();
    return;
  }
  pass("commit", `API_COMMIT matches EXPECTED_COMMIT (${apiCommit})`);

  // --- Credentials (explicit staging only) ---
  const email = env("STAGING_EMAIL");
  const password = env("STAGING_PASSWORD");
  if (!email || !password) {
    fail("auth_env", "STAGING_EMAIL and STAGING_PASSWORD are required. No defaults.");
    fields.AUTH_STATUS = "MISSING_CREDENTIALS";
    blockAndExit();
    return;
  }

  // --- 8. Authenticate ---
  let token = "";
  try {
    const loginRes = await fetch(apiUrl(origin, "/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const loginJson = (await loginRes.json().catch(() => ({}))) as {
      token?: string;
      message?: string;
    };
    token = String(loginJson.token ?? "").trim();
    if (!loginRes.ok || !token) {
      fields.AUTH_STATUS = `FAIL_HTTP_${loginRes.status}`;
      fail(
        "auth",
        `Staging login failed HTTP ${loginRes.status}: ${String(loginJson.message ?? "").slice(0, 120)}`
      );
      blockAndExit();
      return;
    }
    fields.AUTH_STATUS = "PASS";
    pass("auth", "Staging credentials authenticated (token received)");
  } catch (e) {
    fields.AUTH_STATUS = "ERROR";
    fail("auth", e instanceof Error ? e.message : String(e));
    blockAndExit();
    return;
  }

  const authHeaders = { Authorization: `Bearer ${token}` };

  // --- 7. Finance metric definitions (hardening marker) ---
  try {
    const defUrl = apiUrl(origin, "/finance/cod-metric-definitions");
    const defRes = await fetch(defUrl, { headers: authHeaders });
    fields.FINANCE_ENDPOINT_STATUS = `HTTP_${defRes.status}`;
    if (defRes.status === 404) {
      fail(
        "finance_cod_metric_definitions",
        "HTTP 404 — hardening finance routes not deployed. STOP."
      );
      blockAndExit();
      return;
    }
    if (defRes.status !== 200) {
      fail(
        "finance_cod_metric_definitions",
        `Expected HTTP 200, got ${defRes.status}`
      );
      blockAndExit();
      return;
    }
    pass("finance_cod_metric_definitions", `GET → HTTP 200`);
  } catch (e) {
    fields.FINANCE_ENDPOINT_STATUS = "ERROR";
    fail(
      "finance_cod_metric_definitions",
      e instanceof Error ? e.message : String(e)
    );
    blockAndExit();
    return;
  }

  // --- 9. Finance snapshot ---
  const orderId = env("STAGING_ORDER_ID");
  if (!orderId) {
    fail("STAGING_ORDER_ID", "Required for finance snapshot gate check.");
    blockAndExit();
    return;
  }
  try {
    const snapUrl = apiUrl(origin, `/finance/orders/${encodeURIComponent(orderId)}/snapshot`);
    const snapRes = await fetch(snapUrl, { headers: authHeaders });
    if (snapRes.status !== 200) {
      fail(
        "finance_snapshot",
        `Expected HTTP 200 for staging order ${orderId}, got ${snapRes.status}`
      );
      blockAndExit();
      return;
    }
    pass("finance_snapshot", `GET snapshot → HTTP 200 for order ${orderId}`);
  } catch (e) {
    fail("finance_snapshot", e instanceof Error ? e.message : String(e));
    blockAndExit();
    return;
  }

  // --- 10. Frontend points at same staging API ---
  const feUrl = env("STAGING_FRONTEND_URL");
  const feApi = normalizeOrigin(env("STAGING_FRONTEND_API_BASE"));
  if (!feUrl || !feApi) {
    fail(
      "frontend",
      "STAGING_FRONTEND_URL and STAGING_FRONTEND_API_BASE are required (must match staging API)."
    );
    blockAndExit();
    return;
  }
  let feApiOrigin = feApi;
  if (feApiOrigin.toLowerCase().endsWith("/api")) {
    feApiOrigin = normalizeOrigin(feApiOrigin.slice(0, -4));
  }
  if (feApiOrigin !== origin) {
    fail(
      "frontend_api_mismatch",
      `STAGING_FRONTEND_API_BASE (${feApiOrigin}) !== STAGING_API_BASE (${origin})`
    );
    blockAndExit();
    return;
  }
  const feHost = hostOf(feUrl);
  if (BLOCKED_API_HOSTS.has(feHost) || feHost === "shipamaze.vercel.app" || feHost === "www.shipamaze.com") {
    // Allow only if operator explicitly opts in — default block known production FE hosts
    if (env("STAGING_ALLOW_PRODUCTION_FRONTEND_HOST").toLowerCase() !== "true") {
      fail(
        "frontend_host_block",
        `Refusing known production frontend host "${feHost}". Use a staging frontend URL.`
      );
      blockAndExit();
      return;
    }
  }
  try {
    const feRes = await fetch(feUrl, { method: "GET", redirect: "follow" });
    const feText = await feRes.text();
    if (!feRes.ok) {
      fail("frontend_fetch", `STAGING_FRONTEND_URL HTTP ${feRes.status}`);
      blockAndExit();
      return;
    }
    // Hard fail if built assets clearly reference production API
    if (/api\.shipamaze\.com/i.test(feText)) {
      fail(
        "frontend_points_to_production",
        "Frontend HTML/JS bundle references api.shipamaze.com — not staging."
      );
      blockAndExit();
      return;
    }
    pass(
      "frontend",
      `Frontend reachable; STAGING_FRONTEND_API_BASE matches staging API; no api.shipamaze.com in initial document`
    );
  } catch (e) {
    fail("frontend_fetch", e instanceof Error ? e.message : String(e));
    blockAndExit();
    return;
  }

  // --- 11. Staging Mongo separate from production ---
  const expectedDb = env("STAGING_EXPECTED_MONGO_DB");
  const productionDb = env("STAGING_PRODUCTION_MONGO_DB");
  const actualDb = String(healthBody.mongo?.dbName ?? "").trim();
  fields.DATABASE_ENVIRONMENT = actualDb
    ? `${deploymentEnv}:${actualDb}`
    : `${deploymentEnv}:MISSING_DB_NAME`;

  if (!expectedDb || !productionDb) {
    fail(
      "mongo_env",
      "STAGING_EXPECTED_MONGO_DB and STAGING_PRODUCTION_MONGO_DB are required to prove DB separation."
    );
    blockAndExit();
    return;
  }
  if (expectedDb === productionDb) {
    fail(
      "mongo_misconfig",
      "STAGING_EXPECTED_MONGO_DB must not equal STAGING_PRODUCTION_MONGO_DB."
    );
    blockAndExit();
    return;
  }
  if (!actualDb) {
    fail(
      "mongo_dbName",
      "Health did not return mongo.dbName. Cannot prove staging DB separation."
    );
    blockAndExit();
    return;
  }
  if (actualDb === productionDb) {
    fail(
      "mongo_is_production",
      `Connected database "${actualDb}" matches STAGING_PRODUCTION_MONGO_DB. Refusing.`
    );
    blockAndExit();
    return;
  }
  if (actualDb !== expectedDb) {
    fail(
      "mongo_mismatch",
      `Connected database "${actualDb}" !== STAGING_EXPECTED_MONGO_DB "${expectedDb}".`
    );
    blockAndExit();
    return;
  }
  if (healthBody.mongo?.readyState !== 1) {
    fail("mongo_ready", `mongo.readyState=${healthBody.mongo?.readyState} (expected 1)`);
    blockAndExit();
    return;
  }
  pass(
    "mongo",
    `dbName=${actualDb} (staging) ≠ production ${productionDb}; readyState=1`
  );

  // --- Gate complete: no mutations performed ---
  pass(
    "mutation_boundary",
    "Gate did not run wallet/remittance/payout/webhook/courier/concurrency operations."
  );

  printGateSummary(fields, false, checks);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  console.log("");
  console.log("STAGING INFRASTRUCTURE: BLOCKED");
  process.exit(2);
});
