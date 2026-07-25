import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";
import { authHeaders, baseUrl, isSmoke, pickRoundRobin, splitCsv } from "./lib/helpers.js";

const bookingsOk = new Counter("bookings_ok");
const bookingsRateLimited = new Counter("bookings_rate_limited");
const bookingsConflict = new Counter("bookings_conflict");
const bookingsFailed = new Counter("bookings_failed");
const checkRate = new Rate("booking_checks");

const smoke = isSmoke();

export const options = {
  scenarios: {
    concurrent_bookings: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: smoke
        ? [
            { duration: "15s", target: 5 },
            { duration: "15s", target: 5 },
            { duration: "10s", target: 0 },
          ]
        : [
            { duration: "1m", target: 200 },
            { duration: "2m", target: 1000 },
            { duration: "2m", target: 1000 },
            { duration: "1m", target: 0 },
          ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: smoke ? ["rate<0.15"] : ["rate<0.05"],
    http_req_duration: ["p(95)<8000"],
    booking_checks: smoke ? ["rate>0.9"] : ["rate>0.8"],
  },
};

export default function () {
  const orders = splitCsv("ORDER_IDS");
  const orderId = pickRoundRobin(orders, __VU, __ITER);
  const pickupId = __ENV.PICKUP_ID;
  const courierId = __ENV.COURIER_ID;
  const provider = __ENV.PROVIDER || "lorrigo";

  if (!orderId || !pickupId || !courierId) {
    check(null, { "env configured": () => false });
    return;
  }

  const res = http.post(
    `${baseUrl()}/api/courier/shipments`,
    JSON.stringify({
      orderId,
      warehouseId: pickupId,
      pickupAddressId: pickupId,
      provider,
      carrier_id: courierId,
      courierId,
      weight: 0.5,
      length: 10,
      width: 10,
      height: 10,
    }),
    { headers: authHeaders(), tags: { name: "POST /api/courier/shipments" } }
  );

  const ok = check(res, {
    "status is 2xx, 409, or 429": (r) =>
      (r.status >= 200 && r.status < 300) || r.status === 409 || r.status === 429,
  });
  checkRate.add(ok);

  if (res.status >= 200 && res.status < 300) bookingsOk.add(1);
  else if (res.status === 429) bookingsRateLimited.add(1);
  else if (res.status === 409) bookingsConflict.add(1);
  else bookingsFailed.add(1);

  sleep(smoke ? 0.5 : 0.2);
}
