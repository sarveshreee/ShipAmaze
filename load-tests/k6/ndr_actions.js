import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";
import { authHeaders, baseUrl, isSmoke, pickRoundRobin, splitCsv } from "./lib/helpers.js";

const ndrOk = new Counter("ndr_ok");
const ndrFail = new Counter("ndr_fail");

const smoke = isSmoke();

export const options = {
  scenarios: {
    ndr_actions: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: smoke
        ? [
            { duration: "10s", target: 10 },
            { duration: "20s", target: 10 },
            { duration: "10s", target: 0 },
          ]
        : [
            { duration: "30s", target: 100 },
            { duration: "1m", target: 500 },
            { duration: "1m", target: 500 },
            { duration: "30s", target: 0 },
          ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.15"],
    http_req_duration: ["p(95)<5000"],
  },
};

export default function () {
  const awbs = splitCsv("AWBS");
  const awb = pickRoundRobin(awbs, __VU, __ITER);
  if (!awb) {
    check(null, { "AWBS configured": () => false });
    return;
  }

  const action = __ITER % 2 === 0 ? "reattempt" : "return";
  const res = http.post(
    `${baseUrl()}/api/ndr/${encodeURIComponent(awb)}/action`,
    JSON.stringify({
      action,
      remarks: `k6 load test ${action}`,
    }),
    { headers: authHeaders(), tags: { name: "POST /api/ndr/:awb/action" } }
  );

  const ok = check(res, {
    "ndr action accepted or conflict": (r) =>
      r.status === 200 || r.status === 400 || r.status === 404 || r.status === 409 || r.status === 429,
  });

  if (res.status === 200) ndrOk.add(1);
  else if (!ok) ndrFail.add(1);

  sleep(0.1);
}
