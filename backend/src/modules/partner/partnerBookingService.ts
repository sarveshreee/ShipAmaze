import type { Types } from "mongoose";
import type { AuthRequest } from "../../middleware/authMiddleware.js";
import { User } from "../../models/User.js";
import { Order } from "../../models/Order.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import type { IOrder } from "../../models/Order.js";
import type { IPartner } from "../../models/Partner.js";
import {
  bookOrderViaProviderRegistry,
  type BookShipmentResult,
} from "../courier/bookShipment.js";
import { getCourierProvider } from "../courier/providerRegistry.js";
import { getStaticProviderCapabilities, providerSupports } from "../courier/capabilities.js";
import { applyBillableShippingToOrder } from "../../services/billableShippingCharge.js";
import {
  attemptAndTrackShipmentWalletDebit,
  markShipmentWalletDebitPending,
  precheckOrderShipmentWallet,
} from "../../services/shipmentWallet.js";
import type { PartnerCreateShipmentInput } from "./dto/schemas.js";
import { assertPartnerProviderAllowed } from "./partnerPickupService.js";
import { isPartnerWalletBillingEnabled } from "./partnerConfig.js";
import type { CourierProviderId } from "../courier/types.js";

export async function buildLinkedUserAuthRequest(
  linkedUserId: Types.ObjectId
): Promise<AuthRequest> {
  const user = await User.findById(linkedUserId);
  if (!user) throw new AppError(400, "Partner linked user not found");
  return { user } as unknown as AuthRequest;
}

function partnerUsesVelocityWallet(provider: CourierProviderId): boolean {
  return provider === "velocity";
}

function partnerUsesPartnerWalletBilling(provider: CourierProviderId): boolean {
  return isPartnerWalletBillingEnabled() && !partnerUsesVelocityWallet(provider);
}

async function finalizeBillableShipping(
  order: IOrder,
  input: PartnerCreateShipmentInput,
  providerFreight?: number
): Promise<void> {
  await applyBillableShippingToOrder(order, {
    courierName: input.courierName ?? input.provider,
    velocityFreightCost: providerFreight,
    weightKg: input.package.weight,
  }).catch(() => undefined);
}

async function persistOrderWalletDebit(
  order: IOrder,
  input: PartnerCreateShipmentInput,
  booking: BookShipmentResult,
  partner: IPartner
): Promise<void> {
  await finalizeBillableShipping(order, input, booking.freightCharge);

  try {
    await order.save();
  } catch (saveErr) {
    console.warn(
      `[partner:booking] Order save before wallet debit failed orderId=${order.orderId}:`,
      saveErr instanceof Error ? saveErr.message : saveErr
    );
  }

  const refreshed = await Order.findOne({ orderId: order.orderId });
  const target = refreshed ?? order;
  const awb = String(booking.awb ?? target.awb ?? "").trim();

  if (!awb) {
    markShipmentWalletDebitPending(target, "awaiting_awb");
    try {
      await target.save();
    } catch {
      await Order.updateOne(
        { _id: target._id },
        { $set: { walletDebitPending: true, walletDebitFailedAt: new Date() } }
      ).catch(() => undefined);
    }
    return;
  }

  await attemptAndTrackShipmentWalletDebit(target, booking.freightCharge, {
    partnerId: String(partner._id),
    provider: String(input.provider),
  });
}

export async function bookPartnerShipment(opts: {
  partner: IPartner;
  order: IOrder;
  input: PartnerCreateShipmentInput;
  idempotencyKey: string;
}): Promise<BookShipmentResult> {
  const provider = assertPartnerProviderAllowed(opts.partner, opts.input.provider);
  const providerInstance = getCourierProvider(provider);
  const caps = getStaticProviderCapabilities(provider);

  if (!providerInstance.isConfigured()) {
    throw new AppError(503, `${providerInstance.displayName} is not configured`);
  }
  if (!providerSupports(caps, "booking")) {
    throw new AppError(501, `${providerInstance.displayName} booking is not available`);
  }

  await finalizeBillableShipping(opts.order, opts.input);

  if (partnerUsesPartnerWalletBilling(provider)) {
    await precheckOrderShipmentWallet(opts.order);
  }

  const bookingIdempotencyKey = `partner:${String(opts.partner._id)}:${opts.idempotencyKey}`;

  const authReq = await buildLinkedUserAuthRequest(opts.partner.linkedUserId);

  const result = await bookOrderViaProviderRegistry(
    {
      order: opts.order,
      provider,
      pickupAddressId: opts.input.pickupAddressId,
      courierId: String(opts.input.courierId ?? opts.input.provider),
      courierName: opts.input.courierName,
      weightKg: opts.input.package.weight,
      lengthCm: opts.input.package.length,
      widthCm: opts.input.package.width,
      heightCm: opts.input.package.height,
      userId: opts.partner.linkedUserId as Types.ObjectId,
      idempotencyKey: bookingIdempotencyKey,
    },
    { velocityAuthReq: authReq }
  );

  const awb = String(result.awb ?? opts.order.awb ?? "").trim();
  if (partnerUsesPartnerWalletBilling(provider)) {
    await persistOrderWalletDebit(opts.order, opts.input, result, opts.partner);
  }

  return result;
}
