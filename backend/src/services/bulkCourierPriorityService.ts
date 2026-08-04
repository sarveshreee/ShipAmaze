import {
  BulkCourierPriority,
  type IBulkCourierPriorityEntry,
} from "../models/BulkCourierPriority.js";
export type BulkCourierPriorityCandidate = {
  courierName: string;
  carrierId?: string;
  provider?: "velocity" | "lorrigo";
  rank: number;
};

const SETTINGS_KEY = "default";

function normalizeProvider(raw: unknown): "velocity" | "lorrigo" | undefined {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "lorrigo") return "lorrigo";
  if (v === "velocity") return "velocity";
  return undefined;
}

function mapEntries(rows: IBulkCourierPriorityEntry[]): BulkCourierPriorityCandidate[] {
  return [...rows]
    .sort((a, b) => a.rank - b.rank)
    .map((p) => ({
      courierName: p.courierName,
      carrierId: p.carrierId?.trim() || undefined,
      provider: normalizeProvider(p.provider),
      rank: p.rank,
    }));
}

/** Load saved bulk-processing courier priority (persisted in MongoDB). */
export async function getBulkCourierPriority(): Promise<BulkCourierPriorityCandidate[]> {
  const doc = await BulkCourierPriority.findOne({ key: SETTINGS_KEY }).lean();
  if (doc?.priorities?.length) {
    return mapEntries(doc.priorities);
  }
  return [];
}

export async function saveBulkCourierPriority(
  raw: unknown
): Promise<BulkCourierPriorityCandidate[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("priorities must be a non-empty array");
  }

  const priorities: IBulkCourierPriorityEntry[] = [];
  const seen = new Set<string>();

  for (const row of raw) {
    const o = row as Record<string, unknown>;
    const courierName = String(o.courierName ?? "").trim();
    const rank = Number(o.rank);
    const carrierId = String(o.carrierId ?? "").trim();
    const provider = normalizeProvider(o.provider);
    if (!courierName) throw new Error("Each priority entry needs courierName");
    if (!Number.isFinite(rank) || rank < 1) throw new Error("Each priority entry needs rank ≥ 1");
    const key = carrierId
      ? `id:${provider ?? "any"}:${carrierId.toLowerCase()}`
      : `name:${provider ?? "any"}:${courierName.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    priorities.push({
      courierName,
      carrierId: carrierId || undefined,
      provider,
      rank,
    });
  }

  if (priorities.length === 0) {
    throw new Error("priorities must contain at least one courier");
  }

  priorities.sort((a, b) => a.rank - b.rank);
  const normalized = priorities.map((p, idx) => ({ ...p, rank: idx + 1 }));

  await BulkCourierPriority.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set: { priorities: normalized } },
    { upsert: true, new: true }
  );

  return mapEntries(normalized);
}
