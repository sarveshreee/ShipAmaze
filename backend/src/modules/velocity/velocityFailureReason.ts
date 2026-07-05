/**
 * Extract human-readable failure / cancellation reasons from Velocity API payloads.
 */

import type { VelocityTrackingResponse } from "./velocity.types.js";
import { mapVelocityStatus } from "./velocity.mapper.js";
import { normalizeOrderStatus } from "../../utils/orderStatus.js";

const FAILURE_STATUS_KEYWORDS = [
  "fail",
  "cancel",
  "reject",
  "undeliver",
  "not serviceable",
  "unserviceable",
  "rto",
  "ndr",
  "need_attention",
  "needs_attention",
  "lost",
  "damaged",
];

function normalizeReasonText(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (Array.isArray(raw)) {
    return raw.map((v) => String(v).trim()).filter(Boolean).join(", ");
  }
  return s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

function isFailureLikeStatus(status: unknown): boolean {
  const raw = String(status ?? "").trim().toLowerCase();
  if (!raw) return false;
  return FAILURE_STATUS_KEYWORDS.some((k) => raw.includes(k));
}

function pickFromObject(obj: Record<string, unknown>): string {
  const keys = [
    "failure_reason",
    "cancel_reason",
    "cancellation_reason",
    "cancelled_reason",
    "remark",
    "remarks",
    "reason",
    "ndr_reason",
    "sub_status",
    "needs_attention_issue",
    "issue",
    "error_message",
    "message",
    "description",
  ];
  for (const key of keys) {
    const val = obj[key];
    const text = normalizeReasonText(val);
    if (text && text.toLowerCase() !== "success") return text;
  }
  return "";
}

function pickFromTrackingActivities(
  activities: VelocityTrackingResponse["shipment_track_activities"] | undefined
): string {
  if (!Array.isArray(activities) || activities.length === 0) return "";
  for (const act of [...activities].reverse()) {
    const activity = String(act.activity ?? "").trim();
    if (!activity) continue;
    const lower = activity.toLowerCase();
    if (FAILURE_STATUS_KEYWORDS.some((k) => lower.includes(k))) return activity;
  }
  return "";
}

export function extractFailureReasonFromTracking(
  track: VelocityTrackingResponse,
  rawPayload?: unknown
): string {
  const status = String(track.status ?? "");
  const mapped = normalizeOrderStatus(mapVelocityStatus(status));
  const isTerminalFailure =
    mapped === "cancelled" ||
    mapped === "ndr" ||
    mapped === "rto" ||
    isFailureLikeStatus(status);

  if (!isTerminalFailure && !isFailureLikeStatus(track.message)) {
    const activityReason = pickFromTrackingActivities(track.shipment_track_activities);
    if (!activityReason) return "";
  }

  if (track.message && isFailureLikeStatus(track.message)) {
    return normalizeReasonText(track.message);
  }

  if (rawPayload && typeof rawPayload === "object") {
    const fromRaw = pickFromObject(rawPayload as Record<string, unknown>);
    if (fromRaw) return fromRaw;
  }

  const fromActivities = pickFromTrackingActivities(track.shipment_track_activities);
  if (fromActivities) return fromActivities;

  if (track.message) return normalizeReasonText(track.message);
  if (isFailureLikeStatus(status)) return normalizeReasonText(status);
  return "";
}

export function extractFailureReasonFromShipmentRow(row: unknown): string {
  const obj = row != null && typeof row === "object" ? (row as Record<string, unknown>) : {};
  const attrs =
    obj.attributes != null && typeof obj.attributes === "object"
      ? (obj.attributes as Record<string, unknown>)
      : obj;

  const fromAttrs = pickFromObject(attrs);
  if (fromAttrs) return fromAttrs;

  const tracking = Array.isArray(attrs.tracking_details) ? attrs.tracking_details : [];
  for (const t of [...tracking].reverse()) {
    if (t && typeof t === "object") {
      const tr = t as Record<string, unknown>;
      const remark = pickFromObject(tr);
      if (remark) return remark;
      const activity = String(tr.status ?? tr.activity ?? "").trim();
      if (activity && isFailureLikeStatus(activity)) return activity;
    }
  }

  const status = String(attrs.status ?? "");
  if (isFailureLikeStatus(status)) return normalizeReasonText(status);
  return "";
}

export interface IRemarkHistoryEntry {
  reason: string;
  source: string;
  velocityStatus?: string;
  at: Date;
}

export function appendRemarkHistory(
  existing: IRemarkHistoryEntry[] | undefined,
  reason: string,
  source: string,
  velocityStatus?: string
): IRemarkHistoryEntry[] {
  const text = reason.trim();
  if (!text) return existing ?? [];
  const prev = existing ?? [];
  const last = prev[prev.length - 1];
  if (last && last.reason === text) return prev;
  return [...prev, { reason: text, source, velocityStatus, at: new Date() }].slice(-30);
}
