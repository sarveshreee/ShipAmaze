import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";
import { applyDefaultTestEnv } from "../../test/testEnv.js";
import type { IOrder } from "../../models/Order.js";
import type { IPartner } from "../../models/Partner.js";
import { AppError } from "../../middleware/errorMiddleware.js";

applyDefaultTestEnv();

const checkPartnerIdempotency = vi.fn();
const completePartnerIdempotency = vi.fn();
const ensurePartnerIdempotencyPending = vi.fn();
const resetPartnerIdempotencyForRetry = vi.fn();
const fingerprintPartnerRequest = vi.fn();

vi.mock("./partnerIdempotency.js", () => ({
  checkPartnerIdempotency: (...args: unknown[]) => checkPartnerIdempotency(...args),
  completePartnerIdempotency: (...args: unknown[]) => completePartnerIdempotency(...args),
  ensurePartnerIdempotencyPending: (...args: unknown[]) => ensurePartnerIdempotencyPending(...args),
  resetPartnerIdempotencyForRetry: (...args: unknown[]) => resetPartnerIdempotencyForRetry(...args),
  fingerprintPartnerRequest: (...args: unknown[]) => fingerprintPartnerRequest(...args),
}));

const createPartnerOrder = vi.fn();
const findPartnerOrderByReference = vi.fn();

vi.mock("./partnerOrderService.js", () => ({
  createPartnerOrder: (...args: unknown[]) => createPartnerOrder(...args),
  findPartnerOrderByReference: (...args: unknown[]) => findPartnerOrderByReference(...args),
  assertPartnerOrderAccess: vi.fn(),
}));

const bookPartnerShipment = vi.fn();

vi.mock("./partnerBookingService.js", () => ({
  bookPartnerShipment: (...args: unknown[]) => bookPartnerShipment(...args),
}));

const assertPartnerPickupAccess = vi.fn();
const assertPartnerProviderAllowed = vi.fn();
const assertPartnerLorrigoPickupSynced = vi.fn();

vi.mock("./partnerPickupService.js", () => ({
  assertPartnerPickupAccess: (...args: unknown[]) => assertPartnerPickupAccess(...args),
  assertPartnerProviderAllowed: (...args: unknown[]) => assertPartnerProviderAllowed(...args),
  assertPartnerLorrigoPickupSynced: (...args: unknown[]) => assertPartnerLorrigoPickupSynced(...args),
}));

const orderFindOne = vi.fn();

vi.mock("../../models/Order.js", () => ({
  Order: {
    findOne: (...args: unknown[]) => orderFindOne(...args),
  },
}));

import {
  buildShipmentSuccessBody,
  classifyPartnerOrderForCreate,
  processPartnerShipmentCreate,
} from "./partnerShipmentCreateService.js";

const partnerId = new Types.ObjectId();
const linkedUserId = new Types.ObjectId();

const partner = {
  _id: partnerId,
  linkedUserId,
  allowedProviders: ["ekart"],
} as IPartner;

const baseInput = {
  referenceId: "ORDER-REF-1",
  pickupAddressId: String(new Types.ObjectId()),
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
  paymentMode: "prepaid" as const,
};

function makeOrder(overrides: Partial<IOrder> = {}): IOrder {
  return {
    orderId: "SP-TEST-1",
    partnerId,
    partnerReferenceId: "ORDER-REF-1",
    awb: "",
    shipmentCreated: false,
    bookingReconciliationRequired: false,
    courierProvider: "ekart",
    ...overrides,
  } as IOrder;
}

describe("partnerShipmentCreateService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fingerprintPartnerRequest.mockReturnValue("fp-1");
    checkPartnerIdempotency.mockResolvedValue({ action: "proceed" });
    ensurePartnerIdempotencyPending.mockResolvedValue(undefined);
    completePartnerIdempotency.mockResolvedValue(undefined);
    assertPartnerProviderAllowed.mockReturnValue("ekart");
    assertPartnerPickupAccess.mockResolvedValue({ _id: new Types.ObjectId() });
    assertPartnerLorrigoPickupSynced.mockResolvedValue(undefined);
    findPartnerOrderByReference.mockResolvedValue(null);
    orderFindOne.mockImplementation(async ({ orderId }: { orderId: string }) =>
      makeOrder({ orderId })
    );
  });

  it("classifies booked / uncertain / pending orders", () => {
    expect(classifyPartnerOrderForCreate(makeOrder({ awb: "AWB1", shipmentCreated: true }))).toBe(
      "booked"
    );
    expect(
      classifyPartnerOrderForCreate(makeOrder({ bookingReconciliationRequired: true }))
    ).toBe("uncertain");
    expect(classifyPartnerOrderForCreate(makeOrder())).toBe("pending");
  });

  it("reconstructs success for existing booked order without calling provider", async () => {
    const booked = makeOrder({ awb: "AWB-OK", shipmentCreated: true });
    findPartnerOrderByReference.mockResolvedValue(booked);

    const result = await processPartnerShipmentCreate({
      partner,
      apiKeyId: String(new Types.ObjectId()),
      parsed: baseInput,
      idempotencyKey: "idem-1",
      requestId: "req-1",
      correlationId: "corr-1",
    });

    expect(result.kind).toBe("success");
    expect(result.httpStatus).toBe(201);
    expect(bookPartnerShipment).not.toHaveBeenCalled();
    expect(createPartnerOrder).not.toHaveBeenCalled();
    expect(ensurePartnerIdempotencyPending).not.toHaveBeenCalled();
    expect(completePartnerIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({ status: "COMPLETED", httpStatus: 201 })
    );
  });

  it("resumes booking on existing unbooked order (stale PENDING scenario)", async () => {
    const pending = makeOrder();
    findPartnerOrderByReference.mockResolvedValue(pending);
    bookPartnerShipment.mockResolvedValue({
      awb: "AWB-NEW",
      status: "BOOKED",
      freightCharge: 45,
    });

    const result = await processPartnerShipmentCreate({
      partner,
      apiKeyId: String(new Types.ObjectId()),
      parsed: baseInput,
      idempotencyKey: "idem-stale",
      requestId: "req-2",
      correlationId: "corr-2",
    });

    expect(result.kind).toBe("success");
    expect(createPartnerOrder).not.toHaveBeenCalled();
    expect(bookPartnerShipment).toHaveBeenCalledOnce();
    expect(bookPartnerShipment.mock.calls[0]?.[0]?.order).toBe(pending);
    expect(ensurePartnerIdempotencyPending).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "idem-stale",
        orderId: pending.orderId,
      })
    );
    expect(completePartnerIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({ status: "COMPLETED" })
    );
  });

  it("immediate retry after crash before booking reuses idempotency and resumes", async () => {
    const pending = makeOrder({ orderId: "SP-EXISTING" });
    checkPartnerIdempotency.mockResolvedValue({ action: "resume_order", order: pending });
    bookPartnerShipment.mockResolvedValue({ awb: "AWB-R", status: "BOOKED" });

    const result = await processPartnerShipmentCreate({
      partner,
      apiKeyId: String(new Types.ObjectId()),
      parsed: baseInput,
      idempotencyKey: "idem-resume",
      requestId: "req-3",
      correlationId: "corr-3",
    });

    expect(result.kind).toBe("success");
    expect(result.httpStatus).toBe(201);
    expect(createPartnerOrder).not.toHaveBeenCalled();
    expect(bookPartnerShipment).toHaveBeenCalledOnce();
    expect(ensurePartnerIdempotencyPending).toHaveBeenCalledOnce();
    expect(ensurePartnerIdempotencyPending).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "idem-resume",
        requestFingerprint: "fp-1",
        partnerReferenceId: baseInput.referenceId,
        orderId: "SP-EXISTING",
      })
    );
    expect(completePartnerIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({ status: "COMPLETED", httpStatus: 201 })
    );
    expect((result.body.data as { awb?: string }).awb).toBe("AWB-R");
  });

  it("immediate retry with booked order reconstructs success without provider call", async () => {
    const booked = makeOrder({
      orderId: "SP-BOOKED",
      awb: "AWB-ALREADY",
      shipmentCreated: true,
    });
    checkPartnerIdempotency.mockResolvedValue({ action: "resume_order", order: booked });

    const result = await processPartnerShipmentCreate({
      partner,
      apiKeyId: String(new Types.ObjectId()),
      parsed: baseInput,
      idempotencyKey: "idem-booked-retry",
      requestId: "req-booked",
      correlationId: "corr-booked",
    });

    expect(result.kind).toBe("success");
    expect(result.httpStatus).toBe(201);
    expect(bookPartnerShipment).not.toHaveBeenCalled();
    expect(createPartnerOrder).not.toHaveBeenCalled();
    expect(ensurePartnerIdempotencyPending).not.toHaveBeenCalled();
    expect(completePartnerIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({ status: "COMPLETED", httpStatus: 201 })
    );
    expect((result.body.data as { awb?: string }).awb).toBe("AWB-ALREADY");
  });

  it("replays COMPLETED idempotency without provider call", async () => {
    const cached = { success: true, data: { shipmentId: "SP-CACHED" } };
    checkPartnerIdempotency.mockResolvedValue({
      action: "replay",
      httpStatus: 201,
      body: cached,
    });

    const result = await processPartnerShipmentCreate({
      partner,
      apiKeyId: String(new Types.ObjectId()),
      parsed: baseInput,
      idempotencyKey: "idem-done",
      requestId: "req-4",
      correlationId: "corr-4",
    });

    expect(result.kind).toBe("success");
    expect(result.body).toEqual(cached);
    expect(bookPartnerShipment).not.toHaveBeenCalled();
    expect(createPartnerOrder).not.toHaveBeenCalled();
  });

  it("returns conflict for different fingerprint", async () => {
    checkPartnerIdempotency.mockResolvedValue({ action: "conflict" });

    const result = await processPartnerShipmentCreate({
      partner,
      apiKeyId: String(new Types.ObjectId()),
      parsed: baseInput,
      idempotencyKey: "idem-conflict",
      requestId: "req-5",
      correlationId: "corr-5",
    });

    expect(result.kind).toBe("error");
    expect(result.httpStatus).toBe(409);
    expect(createPartnerOrder).not.toHaveBeenCalled();
    expect(ensurePartnerIdempotencyPending).not.toHaveBeenCalled();
  });

  it("allows FAILED retry when reference was released (proceed_after_reset)", async () => {
    checkPartnerIdempotency.mockResolvedValue({ action: "proceed_after_reset" });
    findPartnerOrderByReference.mockResolvedValue(null);
    const newOrder = makeOrder({ orderId: "SP-NEW" });
    createPartnerOrder.mockResolvedValue(newOrder);
    bookPartnerShipment.mockResolvedValue({ awb: "AWB-2", status: "BOOKED" });

    const result = await processPartnerShipmentCreate({
      partner,
      apiKeyId: String(new Types.ObjectId()),
      parsed: baseInput,
      idempotencyKey: "idem-failed-retry",
      requestId: "req-6",
      correlationId: "corr-6",
    });

    expect(resetPartnerIdempotencyForRetry).toHaveBeenCalled();
    expect(createPartnerOrder).toHaveBeenCalledOnce();
    expect(ensurePartnerIdempotencyPending).toHaveBeenCalled();
    expect(result.kind).toBe("success");
  });

  it("UNCERTAIN retry with existing order reuses record without new order", async () => {
    const uncertain = makeOrder({ bookingReconciliationRequired: true });
    checkPartnerIdempotency.mockResolvedValue({ action: "resume_order", order: uncertain });
    bookPartnerShipment.mockRejectedValue(
      Object.assign(new AppError(504, "Uncertain"), {
        code: "BOOKING_UNCERTAIN",
        retryable: false,
      })
    );

    const result = await processPartnerShipmentCreate({
      partner,
      apiKeyId: String(new Types.ObjectId()),
      parsed: baseInput,
      idempotencyKey: "idem-uncertain",
      requestId: "req-7",
      correlationId: "corr-7",
    });

    expect(createPartnerOrder).not.toHaveBeenCalled();
    expect(bookPartnerShipment).toHaveBeenCalledOnce();
    expect(ensurePartnerIdempotencyPending).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: uncertain.orderId })
    );
    expect(result.kind).toBe("error");
    expect(result.httpStatus).toBe(504);
    expect(completePartnerIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({ status: "UNCERTAIN" })
    );
  });

  it("recovers uncertain order via findPartnerOrderByReference without creating new order", async () => {
    const uncertain = makeOrder({ bookingReconciliationRequired: true });
    findPartnerOrderByReference.mockResolvedValue(uncertain);
    bookPartnerShipment.mockRejectedValue(
      Object.assign(new AppError(504, "Uncertain"), {
        code: "BOOKING_UNCERTAIN",
        retryable: false,
      })
    );

    const result = await processPartnerShipmentCreate({
      partner,
      apiKeyId: String(new Types.ObjectId()),
      parsed: baseInput,
      idempotencyKey: "idem-uncertain-ref",
      requestId: "req-7b",
      correlationId: "corr-7b",
    });

    expect(createPartnerOrder).not.toHaveBeenCalled();
    expect(bookPartnerShipment).toHaveBeenCalledOnce();
    expect(result.kind).toBe("error");
    expect(result.httpStatus).toBe(504);
  });

  it("stale PENDING with existing booked order reconstructs without provider call", async () => {
    const booked = makeOrder({
      awb: "AWB-STALE",
      shipmentCreated: true,
    });
    findPartnerOrderByReference.mockResolvedValue(booked);

    const result = await processPartnerShipmentCreate({
      partner,
      apiKeyId: String(new Types.ObjectId()),
      parsed: baseInput,
      idempotencyKey: "idem-stale-booked",
      requestId: "req-stale-booked",
      correlationId: "corr-stale-booked",
    });

    expect(result.kind).toBe("success");
    expect(bookPartnerShipment).not.toHaveBeenCalled();
    expect(createPartnerOrder).not.toHaveBeenCalled();
    expect((result.body.data as { awb?: string }).awb).toBe("AWB-STALE");
  });

  it("phase 5A regression: immediate PENDING resume does not 409", async () => {
    const pending = makeOrder({ orderId: "SP-REGRESSION" });
    checkPartnerIdempotency.mockResolvedValue({ action: "resume_order", order: pending });
    bookPartnerShipment.mockResolvedValue({ awb: "AWB-REG", status: "BOOKED" });

    const result = await processPartnerShipmentCreate({
      partner,
      apiKeyId: String(new Types.ObjectId()),
      parsed: baseInput,
      idempotencyKey: "idem-5a-regression",
      requestId: "req-5a",
      correlationId: "corr-5a",
    });

    expect(result.kind).toBe("success");
    expect(result.httpStatus).toBe(201);
    expect(createPartnerOrder).not.toHaveBeenCalled();
    expect(ensurePartnerIdempotencyPending).toHaveBeenCalledOnce();
  });

  it("phase 5A regression: different fingerprint remains IDEMPOTENCY_CONFLICT", async () => {
    checkPartnerIdempotency.mockResolvedValue({ action: "conflict" });

    const result = await processPartnerShipmentCreate({
      partner,
      apiKeyId: String(new Types.ObjectId()),
      parsed: baseInput,
      idempotencyKey: "idem-5a-conflict",
      requestId: "req-5a-c",
      correlationId: "corr-5a-c",
    });

    expect(result.kind).toBe("error");
    expect(result.httpStatus).toBe(409);
    expect((result.body.error as { code?: string }).code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("Order create race (E11000) resumes existing order instead of DUPLICATE_FIELD", async () => {
    const existing = makeOrder({
      orderId: "SP-RACE",
      awb: "AWB-RACE",
      shipmentCreated: true,
    });
    createPartnerOrder.mockRejectedValue(Object.assign(new Error("E11000 duplicate"), { code: 11000 }));
    findPartnerOrderByReference
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);

    const result = await processPartnerShipmentCreate({
      partner,
      apiKeyId: String(new Types.ObjectId()),
      parsed: baseInput,
      idempotencyKey: "idem-create-race",
      requestId: "req-race",
      correlationId: "corr-race",
    });

    expect(result.kind).toBe("success");
    expect(result.httpStatus).toBe(201);
    expect(bookPartnerShipment).not.toHaveBeenCalled();
    expect((result.body.data as { awb?: string }).awb).toBe("AWB-RACE");
  });

  it("concurrent booking-in-progress does not release reference", async () => {
    const pending = makeOrder({ orderId: "SP-INPROG" });
    findPartnerOrderByReference.mockResolvedValue(pending);
    bookPartnerShipment.mockRejectedValue(new AppError(409, "Booking already in progress for this order"));
    orderFindOne.mockResolvedValue(pending);

    const result = await processPartnerShipmentCreate({
      partner,
      apiKeyId: String(new Types.ObjectId()),
      parsed: baseInput,
      idempotencyKey: "idem-inprog",
      requestId: "req-inprog",
      correlationId: "corr-inprog",
    });

    expect(result.kind).toBe("error");
    expect(result.httpStatus).toBe(409);
    expect((result.body.error as { code?: string }).code).toBe("IDEMPOTENCY_IN_PROGRESS");
    expect((result.body.error as { retryable?: boolean }).retryable).toBe(true);
    expect(completePartnerIdempotency).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "FAILED" })
    );
  });

  it("buildShipmentSuccessBody includes AWB from booked order", () => {
    const body = buildShipmentSuccessBody(
      makeOrder({ awb: "AWB-SUCCESS", shipmentCreated: true }),
      "req",
      "corr"
    );
    expect(body.success).toBe(true);
    expect((body.data as { awb?: string }).awb).toBe("AWB-SUCCESS");
  });
});
