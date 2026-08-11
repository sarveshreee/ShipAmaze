/**
 * Auto-sync ShipAmaze Pickup → Lorrigo pickup-address.
 *
 * Rules:
 * - Non-fatal: local pickup is never rolled back on provider failure
 * - Idempotent: if lorrigoPickupId already set, do not create another pickup
 * - When LORRIGO_ENABLED=false → skip (no provider call)
 * - On create failure: retry once with a simplified unique name, then try to
 *   link an existing Lorrigo hub that matches phone+pincode
 */

import type { Types } from "mongoose";
import { Pickup } from "../../models/Pickup.js";
import { User } from "../../models/User.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import { formatErrorMessage } from "../../utils/errorMessage.js";
import { isLorrigoConfigured, isLorrigoEnabledFlag } from "./lorrigo.config.js";
import { lorrigoGet, lorrigoPost } from "./lorrigo.client.js";

export type LorrigoPickupSyncResult =
  | { synced: true; pickupId: string; alreadySynced?: boolean; durationMs?: number }
  | { synced: false; skipped: true; reason: string }
  | { synced: false; error: string; durationMs?: number };

export type LorrigoPickupPayload = {
  facilityName: string;
  contactPersonName: string;
  email: string;
  pincode: string;
  address: string;
  address2: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  rtoAddress: string;
  rtoPincode: string;
};

/**
 * The exact identity fields Lorrigo has on file for a hub — must be reused verbatim on
 * later shipment bookings (see buildLorrigoOneClickPayload). Recomputing from the local
 * Pickup label/address can drift from whichever payload variant actually got accepted
 * (first attempt, simplified retry, or an existing hub we linked to).
 */
export type LorrigoHubFields = {
  facilityName: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
};

function hubFieldsFromPayload(body: LorrigoPickupPayload): LorrigoHubFields {
  return {
    facilityName: body.facilityName,
    address: body.address,
    city: body.city,
    state: body.state,
    pincode: body.pincode,
    phone: body.phone,
  };
}

/** Best-effort extraction of the hub identity Lorrigo actually stored, from a create/list response row. */
function extractLorrigoHubFields(raw: unknown, fallback: LorrigoHubFields): LorrigoHubFields {
  if (!raw || typeof raw !== "object") return fallback;
  const o = raw as Record<string, unknown>;
  const data = (o.data as Record<string, unknown> | undefined) ?? o;
  const hub = (data.hub as Record<string, unknown> | undefined) ?? data;
  const addrRaw = hub.address;
  const addr =
    addrRaw && typeof addrRaw === "object" && !Array.isArray(addrRaw)
      ? (addrRaw as Record<string, unknown>)
      : undefined;

  const facilityName = pickString(hub, ["facilityName", "name"]) ?? fallback.facilityName;
  const address =
    pickString(addr ?? {}, ["address", "addressLine1"]) ??
    (typeof addrRaw === "string" ? addrRaw.trim() : undefined) ??
    fallback.address;
  const city = pickString(addr ?? {}, ["city"]) ?? pickString(hub, ["city"]) ?? fallback.city;
  const state = pickString(addr ?? {}, ["state"]) ?? pickString(hub, ["state"]) ?? fallback.state;
  const pincode =
    pickString(addr ?? {}, ["pincode", "pinCode", "pin"]) ??
    pickString(hub, ["pincode", "pinCode", "pin"]) ??
    fallback.pincode;
  const phone =
    pickString(hub, ["phone", "contactNumber", "mobile"]) ?? fallback.phone;

  return { facilityName, address, city, state, pincode, phone };
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function extractLorrigoPickupId(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const o = raw as Record<string, unknown>;
  const hub = o.hub as Record<string, unknown> | undefined;
  const data = o.data as Record<string, unknown> | undefined;
  const pickupAddress =
    (o.pickupAddress as Record<string, unknown> | undefined) ||
    (data?.pickupAddress as Record<string, unknown> | undefined);
  const result = o.result as Record<string, unknown> | undefined;
  const candidates = [
    o.id,
    o._id,
    o.pickupAddressId,
    o.pickup_address_id,
    o.pickupId,
    o.pickup_id,
    o.code,
    hub?.id,
    hub?._id,
    hub?.code,
    data?.id,
    data?._id,
    data?.pickupAddressId,
    data?.pickup_address_id,
    data?.pickupId,
    data?.code,
    (data?.hub as Record<string, unknown> | undefined)?.id,
    (data?.hub as Record<string, unknown> | undefined)?.code,
    pickupAddress?.id,
    pickupAddress?._id,
    pickupAddress?.code,
    result?.id,
    result?._id,
    (result?.hub as Record<string, unknown> | undefined)?.id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
    if (typeof c === "number" && Number.isFinite(c)) return String(c);
  }
  return "";
}

function isLorrigoCreateRejected(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const o = raw as Record<string, unknown>;
  if (o.valid === false || o.success === false) {
    const msg =
      (typeof o.message === "string" && o.message.trim()) ||
      (typeof o.error === "string" && o.error.trim()) ||
      "Lorrigo rejected pickup create";
    return msg.slice(0, 300);
  }
  return "";
}

/**
 * Lorrigo text fields only allow A-Z, 0-9, spaces, `-` and `_`.
 * Local ShipAmaze pickup stays as the admin/vendor typed it — we sanitize only
 * the outbound provider payload so Sync never fails on punctuation/backslashes.
 */
export function sanitizeLorrigoTextField(raw: string, fallback = ""): string {
  const cleaned = String(raw ?? "")
    // Common separators → space or hyphen so meaning is preserved
    .replace(/[\\/|,;:]+/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^A-Za-z0-9 _-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || fallback;
}

/**
 * Lorrigo validates:
 * - text fields: A-Z, 0-9, spaces, - and _
 * - address must contain `/` or `-` (we keep `-` after sanitize)
 * - rtoAddress (≥5 chars) and rtoPincode (6 digits) are required
 * When ShipAmaze has no separate RTO address, reuse the pickup address.
 *
 * IMPORTANT: local Pickup documents are never mutated here — only the outbound
 * provider payload is cleaned/truncated so long vendor address dumps can sync.
 */
export function ensureLorrigoAddressShape(address: string): string {
  const cleaned = sanitizeLorrigoTextField(address, "Address");
  if (/[/-]/.test(cleaned)) return cleaned;
  return `${cleaned} -`;
}

/** Lorrigo create often 5xxs on multi-hundred-char address dumps — keep a usable street line. */
const LORRIGO_ADDRESS_MAX = 120;

/**
 * Build a Lorrigo-safe street address from messy vendor/warehouse dumps without
 * changing the stored ShipAmaze pickup. Prefers concrete street tokens and
 * hard-caps length so create pickup-address succeeds.
 */
export function buildLorrigoStreetAddress(line1: string, line2: string, city: string): string {
  const raw = [line1, line2].filter(Boolean).join(" ");
  let cleaned = sanitizeLorrigoTextField(raw, "");

  // Strip repeated form labels common in Indian address paste dumps
  cleaned = cleaned
    .replace(
      /\b(NAME OF PREMISES|BUILDING|FLAT NO|SHOP NO|ROAD\/?STREET|NEAR BY AND LAND MARK|LOCATION|SUB LOCALITY|CIT\/?TOWN|VILLAGE|DIST|STATE|PIN CODE|PINCODE)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  // Prefer the segment that looks like a real street (contains ROAD / STREET / NAGAR / etc.)
  const streetMatch = cleaned.match(
    /([A-Za-z0-9 _-]{0,40}\b(?:ROAD|RD|STREET|ST|NAGAR|COLONY|SOCIETY|PARK|LANE|MARG)\b[A-Za-z0-9 _-]{0,40})/i
  );
  if (streetMatch?.[1]) {
    cleaned = streetMatch[1].trim();
  }

  if (cleaned.length > LORRIGO_ADDRESS_MAX) {
    cleaned = cleaned.slice(0, LORRIGO_ADDRESS_MAX).trim();
  }

  const cityClean = sanitizeLorrigoTextField(city, "City");
  if (cleaned.length < 5) {
    cleaned = `${cleaned} ${cityClean}`.trim();
  }

  return ensureLorrigoAddressShape(cleaned || `${cityClean} warehouse`);
}

/** Short unique facility name — long duplicated warehouse labels often crash Lorrigo create. */
export function buildLorrigoFacilityName(label: string, pincode: string): string {
  const cleaned = sanitizeLorrigoTextField(label, "Pickup") || "Pickup";
  // Drop redundant "Warehouse" noise from vendor→pickup mirrored labels
  const compact = cleaned
    .replace(/\bWarehouse\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const pin = String(pincode ?? "").replace(/\D/g, "").slice(0, 6);
  const base = (compact || cleaned || "Pickup").slice(0, pin ? 40 : 50);
  if (!pin) return base.slice(0, 50);
  const withPin = `${base} ${pin}`.trim();
  return withPin.slice(0, 50);
}

export function pickupToLorrigoPickupPayload(
  pickup: {
    label: string;
    contactName: string;
    phone: string;
    email?: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
  },
  fallbackEmail: string
): LorrigoPickupPayload {
  const email = (pickup.email ?? "").trim().toLowerCase() || fallbackEmail.trim().toLowerCase();
  const pincode = String(pickup.pincode ?? "").replace(/\D/g, "").slice(0, 6);
  const city = sanitizeLorrigoTextField(pickup.city, "City");
  const line2 = sanitizeLorrigoTextField(pickup.addressLine2 ?? "").slice(0, 80);
  // Outbound-only cleanup — does not mutate local Pickup address fields.
  const address = buildLorrigoStreetAddress(pickup.addressLine1, pickup.addressLine2 ?? "", city);
  const facilityName = buildLorrigoFacilityName(pickup.label, pincode);
  const contactPersonName = (
    sanitizeLorrigoTextField(pickup.contactName) ||
    sanitizeLorrigoTextField(pickup.label, "Contact").slice(0, 30) ||
    "Contact"
  ).slice(0, 50);

  return {
    facilityName,
    contactPersonName,
    email,
    pincode,
    address,
    address2: line2,
    phone: String(pickup.phone ?? "").replace(/\D/g, "").slice(-10),
    city,
    state: sanitizeLorrigoTextField(pickup.state, "State"),
    country: sanitizeLorrigoTextField(pickup.country ?? "India", "India") || "India",
    // Required by Lorrigo create pickup-address (default RTO = pickup)
    rtoAddress: address,
    rtoPincode: pincode,
  };
}

function validateLorrigoPickupPayload(body: LorrigoPickupPayload): string | null {
  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return "Email is required to sync this pickup to Lorrigo. Add an email on the pickup address and retry.";
  }
  if (!/^\d{10}$/.test(body.phone)) {
    return "A valid 10-digit phone is required to sync this pickup to Lorrigo.";
  }
  if (!/^\d{6}$/.test(body.pincode)) {
    return "A valid 6-digit pincode is required to sync this pickup to Lorrigo.";
  }
  if (body.address.trim().length < 5) {
    return "Address line 1 is too short for Lorrigo. Update the pickup address and retry.";
  }
  if (!body.facilityName.trim()) {
    return "Warehouse / address name is required to sync to Lorrigo.";
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function asRecordArray(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return raw.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    for (const key of ["data", "hubs", "pickupAddresses", "results", "items", "list"]) {
      const v = o[key];
      if (Array.isArray(v)) {
        return v.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
      }
    }
    // Single hub object
    if (o.hub && typeof o.hub === "object") return [o.hub as Record<string, unknown>];
  }
  return [];
}

/**
 * Best-effort: find an existing Lorrigo hub that matches this pickup (phone + pincode).
 * Used when create fails (duplicate / transient 5xx) so sync can still succeed.
 */
async function findExistingLorrigoPickupId(
  body: LorrigoPickupPayload
): Promise<{ id: string; hub: LorrigoHubFields } | null> {
  const endpoints = ["/v2/pickup-address", "/v2/hubs", "/v2/pickup-addresses"];
  for (const endpoint of endpoints) {
    try {
      const raw = await lorrigoGet<unknown>(endpoint);
      const rows = asRecordArray(raw);
      for (const row of rows) {
        const phone = String(row.phone ?? row.contactNumber ?? row.mobile ?? "")
          .replace(/\D/g, "")
          .slice(-10);
        const addr = (row.address as Record<string, unknown> | undefined) ?? undefined;
        const pin = String(
          addr?.pincode ?? row.pincode ?? row.pin ?? row.pinCode ?? ""
        )
          .replace(/\D/g, "")
          .slice(0, 6);
        const name = sanitizeLorrigoTextField(
          String(row.facilityName ?? row.name ?? row.label ?? ""),
          ""
        ).toLowerCase();
        const targetName = body.facilityName.toLowerCase();
        const phoneMatch = phone && phone === body.phone;
        const pinMatch = pin && pin === body.pincode;
        const nameMatch =
          name &&
          (name === targetName ||
            name.includes(targetName.slice(0, 12)) ||
            targetName.includes(name.slice(0, 12)));
        if ((phoneMatch && pinMatch) || (nameMatch && pinMatch)) {
          const id = extractLorrigoPickupId(row);
          if (id) {
            console.info(
              `[lorrigo] linked existing hub id=${id} via ${endpoint} phone=${phone} pin=${pin}`
            );
            return { id, hub: extractLorrigoHubFields(row, hubFieldsFromPayload(body)) };
          }
        }
      }
    } catch (err) {
      console.info(
        `[lorrigo] list ${endpoint} failed while recovering sync: ${formatErrorMessage(err, "list failed")}`
      );
    }
  }
  return null;
}

/** Look up a hub's exact registered identity by its Lorrigo pickup id (for backfilling old rows). */
async function findLorrigoHubById(pickupId: string): Promise<LorrigoHubFields | null> {
  const endpoints = ["/v2/pickup-address", "/v2/hubs", "/v2/pickup-addresses"];
  for (const endpoint of endpoints) {
    try {
      const raw = await lorrigoGet<unknown>(endpoint);
      const rows = asRecordArray(raw);
      const row = rows.find((r) => extractLorrigoPickupId(r) === pickupId);
      if (row) {
        const fields = extractLorrigoHubFields(row, {
          facilityName: "",
          address: "",
          city: "",
          state: "",
          pincode: "",
          phone: "",
        });
        if (fields.facilityName && fields.address) return fields;
      }
    } catch {
      /* try next endpoint */
    }
  }
  return null;
}

async function createLorrigoPickup(
  body: LorrigoPickupPayload
): Promise<{ id: string; hub: LorrigoHubFields }> {
  const raw = await lorrigoPost<unknown>("/v2/pickup-address", body, { retryable: true });
  const rejected = isLorrigoCreateRejected(raw);
  if (rejected) {
    throw new AppError(422, rejected);
  }
  const providerId = extractLorrigoPickupId(raw);
  if (!providerId) {
    // Some Lorrigo responses nest the id oddly — log sanitized keys for ops.
    const keys =
      raw && typeof raw === "object" ? Object.keys(raw as object).join(",") : typeof raw;
    console.error(`[lorrigo] pickup create returned no id keys=${keys}`);
    throw new AppError(502, "Lorrigo pickup create succeeded but no pickup id was returned");
  }
  return { id: providerId, hub: extractLorrigoHubFields(raw, hubFieldsFromPayload(body)) };
}

/**
 * Sync a local Pickup to Lorrigo.
 * @param force when true, allows retry of FAILED sync; never recreates if lorrigoPickupId exists.
 */
export async function syncPickupToLorrigo(
  pickupId: string | Types.ObjectId,
  opts?: { force?: boolean }
): Promise<LorrigoPickupSyncResult> {
  const id = String(pickupId);

  if (!isLorrigoEnabledFlag()) {
    return { synced: false, skipped: true, reason: "LORRIGO_ENABLED is false" };
  }
  if (!isLorrigoConfigured()) {
    return { synced: false, skipped: true, reason: "Lorrigo credentials not configured" };
  }

  const pickup = await Pickup.findById(id);
  if (!pickup || pickup.deletedAt) {
    return { synced: false, error: "Pickup not found" };
  }

  const existingId = (pickup.lorrigoPickupId ?? "").trim();
  if (existingId) {
    // Idempotency: never create a duplicate on Lorrigo
    let dirty = false;
    if (pickup.lorrigoSyncStatus !== "SUCCESS") {
      pickup.lorrigoSyncStatus = "SUCCESS";
      pickup.lorrigoSyncError = undefined;
      pickup.lorrigoLastSyncAt = new Date();
      dirty = true;
    }
    // Backfill hub identity for pickups synced before this field was tracked — bookings
    // need the exact registered facilityName/address, not a recomputed guess.
    if (!pickup.lorrigoFacilityName?.trim()) {
      const found = await findLorrigoHubById(existingId).catch(() => null);
      if (found) {
        pickup.lorrigoFacilityName = found.facilityName;
        pickup.lorrigoAddress = found.address;
        pickup.lorrigoCity = found.city;
        pickup.lorrigoState = found.state;
        pickup.lorrigoPincode = found.pincode;
        pickup.lorrigoPhone = found.phone;
        dirty = true;
      }
    }
    if (dirty) await pickup.save();
    console.info(
      `[lorrigo] pickup sync skipped (already synced) pickupId=${id} lorrigoPickupId=${existingId}`
    );
    return { synced: true, pickupId: existingId, alreadySynced: true };
  }

  if (pickup.lorrigoSyncStatus === "SUCCESS" && !opts?.force) {
    return { synced: false, skipped: true, reason: "Already marked SUCCESS without provider id" };
  }

  const owner = await User.findById(pickup.userId).select("email").lean();
  const fallbackEmail = typeof owner?.email === "string" ? owner.email : "";
  const body = pickupToLorrigoPickupPayload(pickup, fallbackEmail);

  const validationError = validateLorrigoPickupPayload(body);
  if (validationError) {
    pickup.lorrigoSyncStatus = "FAILED";
    pickup.lorrigoLastSyncAt = new Date();
    pickup.lorrigoSyncError = validationError;
    await pickup.save();
    return { synced: false, error: validationError };
  }

  console.info(
    `[lorrigo] pickup sync started pickupId=${id} facility=${body.facilityName} pin=${body.pincode}`
  );
  const started = Date.now();

  try {
    let providerId = "";
    let hubFields: LorrigoHubFields | null = null;
    let lastError = "";

    try {
      const created = await createLorrigoPickup(body);
      providerId = created.id;
      hubFields = created.hub;
    } catch (err) {
      lastError = formatErrorMessage(err, "Lorrigo pickup sync failed");
      console.warn(`[lorrigo] pickup create attempt 1 failed pickupId=${id} error=${lastError}`);

      // Retry once with an even simpler unique facility name (avoids duplicate / long-label crashes).
      await sleep(600);
      const retryBody: LorrigoPickupPayload = {
        ...body,
        facilityName: buildLorrigoFacilityName(
          `SA ${body.pincode} ${body.phone.slice(-4)}`,
          body.pincode
        ),
        contactPersonName: (body.contactPersonName || "Contact").slice(0, 30),
      };
      try {
        const created = await createLorrigoPickup(retryBody);
        providerId = created.id;
        hubFields = created.hub;
        lastError = "";
      } catch (err2) {
        lastError = formatErrorMessage(err2, lastError || "Lorrigo pickup sync failed");
        console.warn(`[lorrigo] pickup create attempt 2 failed pickupId=${id} error=${lastError}`);
      }
    }

    // Create failed (often duplicate / transient 5xx) — try linking an existing hub.
    if (!providerId) {
      const linked = await findExistingLorrigoPickupId(body);
      if (linked) {
        providerId = linked.id;
        hubFields = linked.hub;
      }
    }

    if (!providerId || !hubFields) {
      throw new AppError(502, lastError || "Lorrigo pickup sync failed");
    }

    pickup.lorrigoPickupId = providerId;
    pickup.lorrigoSyncStatus = "SUCCESS";
    pickup.lorrigoLastSyncAt = new Date();
    pickup.lorrigoSyncError = undefined;
    // Bookings must resend this exact identity — Lorrigo's one-click API tries to
    // re-create the pickup address if the facilityName/address it receives doesn't
    // match what's on file for this id, which fails with a generic 400.
    pickup.lorrigoFacilityName = hubFields.facilityName;
    pickup.lorrigoAddress = hubFields.address;
    pickup.lorrigoCity = hubFields.city;
    pickup.lorrigoState = hubFields.state;
    pickup.lorrigoPincode = hubFields.pincode;
    pickup.lorrigoPhone = hubFields.phone;
    await pickup.save();

    const durationMs = Date.now() - started;
    console.info(
      `[lorrigo] pickup sync succeeded pickupId=${id} lorrigoPickupId=${providerId} durationMs=${durationMs}`
    );
    return { synced: true, pickupId: providerId, durationMs };
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = formatErrorMessage(err, "Lorrigo pickup sync failed");
    pickup.lorrigoSyncStatus = "FAILED";
    pickup.lorrigoLastSyncAt = new Date();
    pickup.lorrigoSyncError = message.slice(0, 500);
    await pickup.save();

    console.error(
      `[lorrigo] pickup sync failed pickupId=${id} durationMs=${durationMs} error=${message}`
    );
    return { synced: false, error: message, durationMs };
  }
}
