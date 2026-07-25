export function baseUrl() {
  return String(__ENV.BASE_URL || "http://localhost:5000").replace(/\/$/, "");
}

export function authHeaders() {
  const token = __ENV.AUTH_TOKEN;
  if (!token) {
    throw new Error("AUTH_TOKEN env is required");
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export function splitCsv(name) {
  return String(__ENV[name] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function pickRoundRobin(list, vu, iter) {
  if (!list.length) return null;
  return list[(vu + iter) % list.length];
}

export function isSmoke() {
  return __ENV.SMOKE === "1" || __ENV.SMOKE === "true";
}
