import mongoose, { Schema, type Document, type Model, type Types } from "mongoose";

export interface ICourierZoneRow {
  courier: string;
  zone: string;
  rates: number[];
  codCharge: number;
  active: boolean;
}

export interface IEnterpriseRateRow {
  courier: string;
  type: "FWD" | "RTO" | "REV";
  slab: "Base" | "Additional";
  zoneRates: number[];
  active: boolean;
}

export interface IShippingRateCard extends Document {
  paymentType: "COD" | "Prepaid";
  zones: string[];
  weights: string[];
  rates: number[][];
  courierZoneRows?: ICourierZoneRow[];
  enterpriseRows?: IEnterpriseRateRow[];
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const courierZoneRowSchema = new Schema<ICourierZoneRow>(
  {
    courier: { type: String, required: true },
    zone: { type: String, required: true },
    rates: { type: [Number], default: [] },
    codCharge: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

const enterpriseRowSchema = new Schema<IEnterpriseRateRow>(
  {
    courier: { type: String, required: true },
    type: { type: String, enum: ["FWD", "RTO", "REV"], required: true },
    slab: { type: String, enum: ["Base", "Additional"], required: true },
    zoneRates: { type: [Number], default: [] },
    active: { type: Boolean, default: true },
  },
  { _id: false }
);

const schema = new Schema<IShippingRateCard>(
  {
    paymentType: { type: String, enum: ["COD", "Prepaid"], required: true, unique: true },
    zones: { type: [String], default: ["A", "B", "C", "D", "E"] },
    weights: { type: [String], default: ["0.5 kg", "1 kg", "2 kg", "5 kg", "10 kg"] },
    rates: { type: [[Number]], default: [] },
    courierZoneRows: { type: [courierZoneRowSchema], default: [] },
    enterpriseRows: { type: [enterpriseRowSchema], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const ShippingRateCard: Model<IShippingRateCard> =
  mongoose.models.ShippingRateCard ||
  mongoose.model<IShippingRateCard>("ShippingRateCard", schema);

export const DEFAULT_ZONES = ["A", "B", "C", "D", "E"];
export const DEFAULT_WEIGHTS = ["0.5 kg", "1 kg", "2 kg", "5 kg", "10 kg"];

export function defaultRateMatrix(): number[][] {
  return DEFAULT_ZONES.map((_, zi) =>
    DEFAULT_WEIGHTS.map((_, wi) => 30 + zi * 8 + wi * 15)
  );
}

/** Validate zone rate matrix before persisting. */
export function parseAndValidateRateMatrix(
  raw: unknown,
  zones: string[],
  weights: string[]
): number[][] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error("rates must be a non-empty matrix");
  }
  if (raw.length !== zones.length) {
    throw new Error(`rates must have ${zones.length} zone rows`);
  }
  const out: number[][] = [];
  for (let zi = 0; zi < raw.length; zi++) {
    const row = raw[zi];
    if (!Array.isArray(row) || row.length !== weights.length) {
      throw new Error(`Zone row ${zi + 1} must have ${weights.length} weight slabs`);
    }
    const parsedRow: number[] = [];
    for (let wi = 0; wi < row.length; wi++) {
      const n = Number(row[wi]);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error(`Invalid rate at zone ${zones[zi] ?? zi}, slab ${weights[wi] ?? wi}: must be a number ≥ 0`);
      }
      parsedRow.push(n);
    }
    out.push(parsedRow);
  }
  return out;
}
