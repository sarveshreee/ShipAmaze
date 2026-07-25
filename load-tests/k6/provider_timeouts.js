import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";
import { authHeaders, baseUrl, isSmoke } from "./lib/helpers.js";

const timeouts = new Counter("client_timeouts");
const recovered = new Counter("timeout_recovered");

const smoke = isSmoke();

export const options = {
  scenarios: {
    timeout_tolerance: {
      executor: "constant-vus",
      vus: smoke ? 5 : 100,
      duration: smoke ? "20s" : "2m",
    },
  },
  thresholds: {
    // Many requests may abort client-side — that is the point of this scenario.
    http_req_failed: ["rate<0.95"],
    checks: ["rate>0.5"],
  },
};

export default function () {
  // Short client timeout to simulate provider slowness / gateway cutoff.
  const res = http.get(`${baseUrl()}/api/health/ready`, {
    headers: authHeaders(),
    timeout: "100ms",
    tags: { name: "health_ready_short_timeout" },
  });

  const timedOut = res.error_code === 1050 || String(res.error || "").toLowerCase().includes("timeout");
  if (timedOut) timeouts.add(1);

  // Follow with a normal-timeout request — platform should still respond.
  const healthy = http.get(`${baseUrl()}/api/health`, {
    timeout: "10s",
    tags: { name: "health_ok" },
  });

  const ok = check(healthy, {
    "health recovers after short timeouts": (r) => r.status === 200,
  });
  if (ok) recovered.add(1);

  sleep(0.05);
}
