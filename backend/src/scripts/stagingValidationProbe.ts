/**
 * Staging validation entrypoint — INFRASTRUCTURE GATE ONLY until the gate passes.
 *
 * This file intentionally does NOT run wallet, remittance, payout, Shopify webhook,
 * courier booking, or concurrency tests. Those must wait for:
 *
 *   STAGING INFRASTRUCTURE: PASS
 *
 * Usage:
 *   npx tsx src/scripts/stagingValidationProbe.ts
 *   # or
 *   npx tsx src/scripts/stagingInfrastructureGate.ts
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const gateScript = path.join(here, "stagingInfrastructureGate.ts");

console.log("Running STAGING INFRASTRUCTURE GATE (read-only).");
console.log("Mutating staging validation is blocked until the gate passes.");
console.log("");

const child = spawn("npx", ["tsx", gateScript], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code) => {
  const exitCode = code ?? 2;
  if (exitCode !== 0) {
    console.log("");
    console.log(
      "Full staging validation NOT started. Fix infrastructure blockers first."
    );
    console.log(
      "Do not label any feature PASS, STAGING VERIFIED, or LIVE VERIFIED."
    );
  }
  process.exit(exitCode);
});
