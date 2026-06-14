/** Canonical dropshipper identifier is User._id (24-char hex ObjectId). */

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

export function isDropshipperUserId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const id = value.trim();
  return id.length > 0 && id !== "[object Object]" && OBJECT_ID_RE.test(id);
}

/** Normalize API/list payloads to User._id; returns empty string if invalid. */
export function normalizeDropshipperUserId(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") {
    const id = raw.trim();
    return isDropshipperUserId(id) ? id : "";
  }
  if (typeof raw === "object" && "_id" in (raw as object)) {
    return normalizeDropshipperUserId((raw as { _id: unknown })._id);
  }
  const s = String(raw).trim();
  return isDropshipperUserId(s) ? s : "";
}

export function assertDropshipperUserId(raw: unknown, label = "userId"): string {
  const id = normalizeDropshipperUserId(raw);
  if (!id) throw new Error(`Invalid ${label}: expected User._id`);
  return id;
}
