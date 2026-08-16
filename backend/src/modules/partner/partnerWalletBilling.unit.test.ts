import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { applyDefaultTestEnv } from "../../test/testEnv.js";
import type { IOrder } from "../../models/Order.js";
import type { IPartner } from "../../models/Partner.js";
import { AppError } from "../../middleware/errorMiddleware.js";

applyDefaultTestEnv();

const precheckOrderShipmentWallet = vi.fn();
const attemptAndTrackShipmentWalletDebit = vi.fn();
const markShipmentWalletDebitPending = vi.fn();
const bookOrderViaProviderRegistry = vi.fn();
const applyBillableShippingToOrder = vi.fn();

vi.mock("../../services/shipmentWallet.js", () => ({
  precheckOrderShipmentWallet: (...args: unknown[]) => precheckOrderShipmentWallet(...args),
  attemptAndTrackShipmentWalletDebit: (...args: unknown[]) =>
    attemptAndTrackShipmentWalletDebit(...args),
  markShipmentWalletDebitPending: (...args: unknown[]) => markShipmentWalletDebitPending(...args),
}));

vi.mock("../courier/bookShipment.js", () => ({
  bookOrderViaProviderRegistry: (...args: unknown[]) => bookOrderViaProviderRegistry(...args),
}));

vi.mock("../../services/billableShippingCharge.js", () => ({
  applyBillableShippingToOrder: (...args: unknown[]) => applyBillableShippingToOrder(...args),
}));

vi.mock("../../models/User.js", () => ({
  User: {
    findById: vi.fn(async () => ({
      _id: new Types.ObjectId(),
      role: "dropshipper",
    })),
  },
}));

vi.mock("../../models/Order.js", () => ({
  Order: {
    findOne: vi.fn(async () => null),
  },
}));

vi.mock("../courier/providerRegistry.js", () => ({
  getCourierProvider: vi.fn(() => ({
    id: "ekart",
    displayName: "Ekart",
    isConfigured: () => true,
    capabilities: { booking: true },
  })),
  resolveCourierProviderId: vi.fn((id: string) => id),
}));

vi.mock("../courier/capabilities.js", () => ({
  getStaticProviderCapabilities: vi.fn(() => ({ booking: true })),
  providerSupports: vi.fn((_caps: unknown, cap: string) => cap === "booking"),
}));

import { bookPartnerShipment } from "./partnerBookingService.js";
import * as partnerConfig from "./partnerConfig.js";
import { getCourierProvider } from "../courier/providerRegistry.js";

const linkedUserId = new Types.ObjectId();
const partnerId = new Types.ObjectId();

const baseInput = {
  referenceId: "ORDER-1",
  pickupAddressId: "507f1f77bcf86cd799439011",
  provider: "ekart" as const,
  customer: {
    name: "Customer",
    phone: "9999999999",
    email: "c@example.com",
    address: "Addr",
    city: "Mumbai",
    state: "MH",
    pincode: "400001",
  },
  package: { weight: 0.5, length: 10, width: 10, height: 5 },
  paymentMode: "cod" as const,
  codAmount: 500,
};

function makePartner(): IPartner {
  return {
    _id: partnerId,
    linkedUserId,
    allowedProviders: ["ekart"],
  } as IPartner;
}

function makeOrder(): IOrder {
  const order = {
    orderId: "SP-WALLET-1",
    awb: "",
    dropshipperId: linkedUserId,
    ownerUserId: linkedUserId,
    save: vi.fn(async () => undefined),
  } as unknown as IOrder;
  return order;
}

describe("partnerWalletBilling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PARTNER_WALLET_BILLING_ENABLED = "false";
    applyBillableShippingToOrder.mockResolvedValue(null);
    bookOrderViaProviderRegistry.mockResolvedValue({
      awb: "AWB123",
      freightCharge: 45,
      status: "booked",
    });
    attemptAndTrackShipmentWalletDebit.mockResolvedValue({ applied: true, amount: 45 });
    precheckOrderShipmentWallet.mockResolvedValue(undefined);
  });

  it("billing disabled — no partner wallet precheck or debit for Ekart", async () => {
    await bookPartnerShipment({
      partner: makePartner(),
      order: makeOrder(),
      input: baseInput,
      idempotencyKey: "key-1",
    });
    expect(precheckOrderShipmentWallet).not.toHaveBeenCalled();
    expect(attemptAndTrackShipmentWalletDebit).not.toHaveBeenCalled();
  });

  it("billing enabled — Ekart prechecks before provider and debits after success", async () => {
    process.env.PARTNER_WALLET_BILLING_ENABLED = "true";
    const order = makeOrder();
    await bookPartnerShipment({
      partner: makePartner(),
      order,
      input: baseInput,
      idempotencyKey: "key-2",
    });
    expect(precheckOrderShipmentWallet).toHaveBeenCalledOnce();
    expect(bookOrderViaProviderRegistry).toHaveBeenCalled();
    expect(precheckOrderShipmentWallet.mock.invocationCallOrder[0]).toBeLessThan(
      bookOrderViaProviderRegistry.mock.invocationCallOrder[0]!
    );
    expect(attemptAndTrackShipmentWalletDebit).toHaveBeenCalledOnce();
  });

  it("billing enabled — insufficient balance throws before provider call", async () => {
    process.env.PARTNER_WALLET_BILLING_ENABLED = "true";
    precheckOrderShipmentWallet.mockRejectedValue(new AppError(402, "Insufficient wallet balance"));
    await expect(
      bookPartnerShipment({
        partner: makePartner(),
        order: makeOrder(),
        input: baseInput,
        idempotencyKey: "key-3",
      })
    ).rejects.toMatchObject({ statusCode: 402 });
    expect(bookOrderViaProviderRegistry).not.toHaveBeenCalled();
    expect(attemptAndTrackShipmentWalletDebit).not.toHaveBeenCalled();
  });

  it("billing enabled — provider failure does not debit", async () => {
    process.env.PARTNER_WALLET_BILLING_ENABLED = "true";
    bookOrderViaProviderRegistry.mockRejectedValue(new AppError(500, "Provider failed"));
    await expect(
      bookPartnerShipment({
        partner: makePartner(),
        order: makeOrder(),
        input: baseInput,
        idempotencyKey: "key-4",
      })
    ).rejects.toMatchObject({ statusCode: 500 });
    expect(attemptAndTrackShipmentWalletDebit).not.toHaveBeenCalled();
  });

  it("billing enabled — Velocity skips partner wallet layer", async () => {
    process.env.PARTNER_WALLET_BILLING_ENABLED = "true";
    vi.mocked(getCourierProvider).mockReturnValue({
      id: "velocity",
      displayName: "Velocity",
      isConfigured: () => true,
      capabilities: { booking: true },
    } as never);

    const velocityInput = { ...baseInput, provider: "velocity" as const };
    const partner = makePartner();
    partner.allowedProviders = ["velocity", "ekart"];

    await bookPartnerShipment({
      partner,
      order: makeOrder(),
      input: velocityInput,
      idempotencyKey: "key-5",
    });
    expect(precheckOrderShipmentWallet).not.toHaveBeenCalled();
    expect(attemptAndTrackShipmentWalletDebit).not.toHaveBeenCalled();
  });

  it("billing enabled — booking without AWB marks wallet debit pending", async () => {
    process.env.PARTNER_WALLET_BILLING_ENABLED = "true";
    bookOrderViaProviderRegistry.mockResolvedValue({
      awb: "",
      freightCharge: 45,
      status: "pending",
    });
    const order = makeOrder();
    await bookPartnerShipment({
      partner: makePartner(),
      order,
      input: baseInput,
      idempotencyKey: "key-6",
    });
    expect(markShipmentWalletDebitPending).toHaveBeenCalled();
    expect(attemptAndTrackShipmentWalletDebit).not.toHaveBeenCalled();
  });

  it("isPartnerWalletBillingEnabled defaults false", () => {
    delete process.env.PARTNER_WALLET_BILLING_ENABLED;
    expect(partnerConfig.isPartnerWalletBillingEnabled()).toBe(false);
  });
});
