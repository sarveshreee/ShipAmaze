import { z } from "zod";

const dimensionsSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const partnerServiceabilitySchema = z.object({
  fromPincode: z.string().min(6).max(6),
  toPincode: z.string().min(6).max(6),
  paymentMode: z.enum(["cod", "prepaid", "COD", "PREPAID"]).transform((v) =>
    String(v).toLowerCase() as "cod" | "prepaid"
  ),
  weight: z.number().positive().optional(),
  dimensions: dimensionsSchema.optional(),
  codValue: z.number().positive().optional(),
  provider: z.enum(["velocity", "lorrigo", "ekart"]).optional(),
});

export const partnerRatesSchema = partnerServiceabilitySchema.extend({
  weight: z.number().positive(),
});

const customerSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(10).max(15),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().min(1).max(500),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  pincode: z.string().regex(/^\d{6}$/, "pincode must be 6 digits"),
});

const packageSchema = z.object({
  weight: z.number().positive(),
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
});

export const partnerCreateShipmentSchema = z.object({
  referenceId: z.string().min(1).max(128),
  pickupAddressId: z.string().min(1),
  provider: z.enum(["velocity", "lorrigo", "ekart"]),
  customer: customerSchema,
  package: packageSchema,
  paymentMode: z.enum(["cod", "prepaid", "COD", "PREPAID"]).transform((v) =>
    String(v).toLowerCase() as "cod" | "prepaid"
  ),
  codAmount: z.number().nonnegative().optional(),
  courierId: z.string().optional(),
  courierName: z.string().optional(),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        sku: z.string().optional(),
        quantity: z.number().int().positive().default(1),
        price: z.number().nonnegative().default(0),
      })
    )
    .optional(),
});

export type PartnerCreateShipmentInput = z.infer<typeof partnerCreateShipmentSchema>;

export const partnerCreatePartnerSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  linkedUserId: z.string().min(1),
  allowedProviders: z.array(z.enum(["velocity", "lorrigo", "ekart"])).optional(),
  allowedPickupIds: z.array(z.string()).optional(),
});

export const partnerCreateKeySchema = z.object({
  name: z.string().max(100).optional(),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const partnerUpdateStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "DISABLED"]),
  reason: z.string().max(500).optional(),
});
