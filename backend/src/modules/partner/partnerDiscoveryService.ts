import type { Types } from "mongoose";
import { discoverRates, discoverServiceability } from "../courier/discoverCouriers.js";
import { listConfiguredCourierProviders } from "../courier/providerRegistry.js";
import { getStaticProviderCapabilities, providerSupports } from "../courier/capabilities.js";
import type { CourierDiscoveryMode, CourierProviderId } from "../courier/types.js";
import type { IPartner } from "../../models/Partner.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import { partnerAllowedProviders, assertPartnerProviderAllowed } from "./partnerPickupService.js";
import { mapCourierOptionToDto } from "./dto/responses.js";
import type { z } from "zod";
import type { partnerServiceabilitySchema } from "./dto/schemas.js";

function pin6(raw: string): string {
  return String(raw).replace(/\D/g, "").slice(0, 6);
}

function resolveDiscoveryMode(
  partner: IPartner,
  provider?: CourierProviderId
): CourierDiscoveryMode | undefined {
  if (provider) {
    assertPartnerProviderAllowed(partner, provider);
    return provider;
  }
  const allowed = partnerAllowedProviders(partner);
  const configured = listConfiguredCourierProviders().map((p) => p.id);
  const active = allowed.filter((id) => configured.includes(id));
  if (active.length === 0) {
    throw new AppError(503, "No courier providers are configured for this partner");
  }
  if (active.length === 1) return active[0];
  return "both";
}

function filterOptionsForPartner(
  partner: IPartner,
  couriers: Awaited<ReturnType<typeof discoverServiceability>>["couriers"]
) {
  const allowed = partnerAllowedProviders(partner);
  return couriers.filter((c) => allowed.includes(c.provider));
}

export async function partnerDiscoverServiceability(
  partner: IPartner,
  input: z.infer<typeof partnerServiceabilitySchema>
) {
  const fromPincode = pin6(input.fromPincode);
  const toPincode = pin6(input.toPincode);
  if (fromPincode.length !== 6 || toPincode.length !== 6) {
    throw new AppError(400, "fromPincode and toPincode must be 6 digits");
  }

  const mode = resolveDiscoveryMode(partner, input.provider);

  const result = await discoverServiceability(
    {
      fromPincode,
      toPincode,
      paymentMode: input.paymentMode,
      weightKg: input.weight,
      lengthCm: input.dimensions?.length,
      widthCm: input.dimensions?.width,
      heightCm: input.dimensions?.height,
      collectableAmount: input.codValue,
      codValue: input.codValue,
    },
    { mode }
  );

  const filtered = filterOptionsForPartner(partner, result.couriers);
  return {
    couriers: filtered.map(mapCourierOptionToDto),
    serviceable: filtered.length > 0,
    providers: result.providers,
  };
}

export async function partnerDiscoverRates(
  partner: IPartner,
  input: z.infer<typeof partnerServiceabilitySchema> & { weight: number }
) {
  const fromPincode = pin6(input.fromPincode);
  const toPincode = pin6(input.toPincode);
  if (fromPincode.length !== 6 || toPincode.length !== 6) {
    throw new AppError(400, "fromPincode and toPincode must be 6 digits");
  }

  const mode = resolveDiscoveryMode(partner, input.provider);
  const allowedProviders = partnerAllowedProviders(partner);

  if (input.provider) {
    const caps = getStaticProviderCapabilities(input.provider);
    if (!providerSupports(caps, "rates")) {
      return {
        couriers: [],
        ratesAvailable: false,
        message: `${input.provider} does not support rate quotes`,
        providers: [],
      };
    }
  } else {
    const anyRates = allowedProviders.some((id) =>
      providerSupports(getStaticProviderCapabilities(id), "rates")
    );
    if (!anyRates) {
      return {
        couriers: [],
        ratesAvailable: false,
        message: "No configured providers support rate quotes for this partner",
        providers: [],
      };
    }
  }

  const result = await discoverRates(
    {
      fromPincode,
      toPincode,
      paymentMode: input.paymentMode,
      weightKg: input.weight,
      lengthCm: input.dimensions?.length ?? 10,
      widthCm: input.dimensions?.width ?? 10,
      heightCm: input.dimensions?.height ?? 10,
      codValue: input.codValue,
    },
    { mode }
  );

  const filtered = filterOptionsForPartner(partner, result.couriers);
  return {
    couriers: filtered.map(mapCourierOptionToDto),
    ratesAvailable: filtered.length > 0,
    providers: result.providers,
  };
}
