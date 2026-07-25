import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";
import { authHeaders, baseUrl, isSmoke, pickRoundRobin, splitCsv } from "./lib/helpers.js";

const retries = new Counter("booking_client_retries");
const eventualOk = new Counter("booking_retry_eventual_ok");

const smoke = isSmoke();

export const options = {
  scenarios: {
    retry_storm: {
      executor: "constant-vus",
      vus: smoke ? 10 : 200,
      duration: smoke ? "30s" : "2m",
    },
  },
  // Retry storms intentionally create 429s — looser fail rate.
  thresholds: {
    http_req_failed: ["rate<0.60"],
    http_req_duration: ["p(95)<10000"],
  },
};

function bookOnce(orderId) {
  return http.post(
    `${baseUrl()}/api/courier/shipments`,
    JSON.stringify({
      orderId,
      warehouseId: __ENV.PICKUP_ID,
      pickupAddressId: __ENV.PICKUP_ID,
      provider: __ENV.PROVIDER || "lorrigo",
      carrier_id: __ENV.COURIER_ID,
      courierId: __ENV.COURIER_ID,
      weight: 0.5,
      length: 10,
      width: 10,
      height: 10,
      idempotencyKey: `k6-retry-${orderId}`,
    }),
    { headers: authHeaders(), tags: { name: "booking_retry" } }
  );
}

export default function () {
  const orders = splitCsv("ORDER_IDS");
  const orderId = pickRoundRobin(orders, __VU, __ITER);
  if (!orderId || !__ENV.PICKUP_ID || !__ENV.COURIER_ID) {
    check(null, { "env configured": () => false });
    return;
  }

  let res = bookOnce(orderId);
  let attempt = 1;
  while ((res.status === 429 || res.status >= 500) && attempt < 4) {
    retries.add(1);
    const retryAfter = Number(res.headers["Retry-After"] || res.headers["retry-after"] || 1);
    sleep(Math.min(Math.max(retryAfter, 0.2), 5));
    res = bookOnce(orderId);
    attempt += 1;
  }

  check(res, {
    "final status ok/conflict/rate-limit": (r) =>
      (r.status >= 200 && r.status < 300) || r.status === 409 || r.status === 429,
  });

  if (res.status >= 200 && res.status < 300) eventualOk.add(1);
  sleep(0.1);
}
