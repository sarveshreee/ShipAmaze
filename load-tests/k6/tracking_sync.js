import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";
import { authHeaders, baseUrl, isSmoke, pickRoundRobin, splitCsv } from "./lib/helpers.js";

const syncOk = new Counter("sync_ok");
const syncFail = new Counter("sync_fail");

const smoke = isSmoke();

export const options = {
  scenarios: {
    tracking_pressure: {
      executor: "shared-iterations",
      vus: smoke ? 20 : 200,
      iterations: smoke ? 100 : 5000,
      maxDuration: smoke ? "1m" : "10m",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.10"],
    http_req_duration: ["p(95)<5000"],
  },
};

export default function () {
  const awbs = splitCsv("AWBS");
  const awb = pickRoundRobin(awbs, __VU, __ITER);

  // Multi-provider NDR/status sync endpoints + optional per-AWB track
  const syncRes = http.post(
    `${baseUrl()}/api/courier/sync-ndr`,
    JSON.stringify({ daysBack: 30 }),
    { headers: authHeaders(), tags: { name: "POST /api/courier/sync-ndr" } }
  );

  const velocitySync = http.post(
    `${baseUrl()}/api/velocity/sync-statuses`,
    JSON.stringify({ batchSize: 50 }),
    { headers: authHeaders(), tags: { name: "POST /api/velocity/sync-statuses" } }
  );

  let trackOk = true;
  if (awb) {
    const track = http.post(
      `${baseUrl()}/api/velocity/track`,
      JSON.stringify({ awb }),
      { headers: authHeaders(), tags: { name: "POST /api/velocity/track" } }
    );
    trackOk = track.status === 200 || track.status === 503; // 503 if Velocity disabled
  }

  const ok = check(null, {
    "sync-ndr acceptable": () => syncRes.status === 200 || syncRes.status === 429,
    "velocity sync acceptable": () =>
      velocitySync.status === 200 || velocitySync.status === 503 || velocitySync.status === 429,
    "track acceptable": () => trackOk,
  });

  if (ok) syncOk.add(1);
  else syncFail.add(1);

  sleep(0.05);
}
