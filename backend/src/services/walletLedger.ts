import mongoose, { type ClientSession, type Types } from "mongoose";
import { randomBytes } from "crypto";
import { Wallet } from "../models/Wallet.js";
import { Transaction, type WalletReferenceType as TxRef } from "../models/Transaction.js";
import { AppError } from "../middleware/errorMiddleware.js";
import type { IOrder } from "../models/Order.js";

export type WalletReferenceType = TxRef;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function assertPositiveAmount(amount: number, label = "amount"): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError(400, `${label} must be a finite number greater than 0`);
  }
}

/** User whose wallet is billed for an order (dropshipper / vendor owner). */
export function orderWalletUserId(order: IOrder): Types.ObjectId | null {
  const uid = order.ownerUserId ?? order.dropshipperId ?? order.createdBy;
  return uid ? (uid as Types.ObjectId) : null;
}

async function ensureWalletDoc(userId: Types.ObjectId, session?: ClientSession | null): Promise<InstanceType<typeof Wallet>> {
  let w = await Wallet.findOne({ userId }).session(session ?? null);
  if (!w) {
    const created = session
      ? await Wallet.create([{ userId, balance: 0, currency: "INR" }], { session })
      : await Wallet.create([{ userId, balance: 0, currency: "INR" }]);
    w = created[0]!;
  }
  return w;
}

export async function getWalletBalance(userId: Types.ObjectId): Promise<number> {
  const w = await ensureWalletDoc(userId, null);
  return roundMoney(w.balance ?? 0);
}

export async function assertWalletBalanceAtLeast(userId: Types.ObjectId, minAmount: number): Promise<void> {
  assertPositiveAmount(minAmount, "minimum balance check");
  const bal = await getWalletBalance(userId);
  if (bal < roundMoney(minAmount)) {
    throw new AppError(402, "Insufficient wallet balance for this operation");
  }
}

export type CreditWalletInput = {
  userId: Types.ObjectId;
  amount: number;
  description: string;
  ledgerType: string;
  referenceType: WalletReferenceType;
  referenceId?: string;
  reason?: string;
  /** When true, skip wallet transactional email (rare). */
  suppressWalletEmail?: boolean;
};

export type DebitWalletInput = {
  userId: Types.ObjectId;
  amount: number;
  description: string;
  ledgerType: string;
  referenceType: WalletReferenceType;
  referenceId: string;
  reason?: string;
  suppressWalletEmail?: boolean;
};

async function insertTransaction(doc: Record<string, unknown>, session: ClientSession | null): Promise<void> {
  try {
    await Transaction.create([doc], session ? { session } : {});
  } catch (e: unknown) {
    const code = (e as { code?: number })?.code;
    if (code === 11000) {
      throw new AppError(409, "Duplicate wallet transaction for this reference");
    }
    throw e;
  }
}

export async function creditWallet(input: CreditWalletInput): Promise<{ balanceAfter: number; txnId: string }> {
  assertPositiveAmount(input.amount);
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const wallet = await ensureWalletDoc(input.userId, session);
    const balanceBefore = roundMoney(wallet.balance ?? 0);
    const balanceAfter = roundMoney(balanceBefore + input.amount);
    wallet.balance = balanceAfter;
    await wallet.save({ session });

    const txnId = `TXN-${Date.now()}-${randomBytes(3).toString("hex")}`;
    await insertTransaction(
      {
        userId: input.userId,
        txnId,
        date: new Date().toISOString().slice(0, 10),
        description: input.description,
        type: "Credit",
        amount: roundMoney(input.amount),
        balance: balanceAfter,
        balanceBefore,
        status: "completed",
        ledgerType: input.ledgerType,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        reason: input.reason ?? input.description,
      } as Record<string, unknown>,
      session
    );

    await session.commitTransaction();
    if (!input.suppressWalletEmail) {
      try {
        const { sendWalletTxnEmail } = await import("./email/emailService.js");
        await sendWalletTxnEmail({
          userId: input.userId,
          credit: true,
          amount: roundMoney(input.amount),
          balanceAfter,
          reason: input.reason ?? input.description,
          reference: input.referenceId ?? txnId,
        });
      } catch {
        /* email must not break ledger */
      }
    }
    return { balanceAfter, txnId };
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

export async function debitWallet(input: DebitWalletInput): Promise<{ balanceAfter: number; txnId: string }> {
  assertPositiveAmount(input.amount);
  if (!String(input.referenceId || "").trim()) {
    throw new AppError(400, "referenceId is required for debits");
  }
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const wallet = await ensureWalletDoc(input.userId, session);
    const balanceBefore = roundMoney(wallet.balance ?? 0);
    const amt = roundMoney(input.amount);
    if (balanceBefore < amt) {
      throw new AppError(402, "Insufficient wallet balance");
    }
    const balanceAfter = roundMoney(balanceBefore - amt);
    wallet.balance = balanceAfter;
    await wallet.save({ session });

    const txnId = `TXN-${Date.now()}-${randomBytes(3).toString("hex")}`;
    await insertTransaction(
      {
        userId: input.userId,
        txnId,
        date: new Date().toISOString().slice(0, 10),
        description: input.description,
        type: "Debit",
        amount: amt,
        balance: balanceAfter,
        balanceBefore,
        status: "completed",
        ledgerType: input.ledgerType,
        referenceType: input.referenceType,
        referenceId: input.referenceId.trim(),
        reason: input.reason ?? input.description,
      } as Record<string, unknown>,
      session
    );

    await session.commitTransaction();
    if (!input.suppressWalletEmail) {
      try {
        const { sendWalletTxnEmail } = await import("./email/emailService.js");
        await sendWalletTxnEmail({
          userId: input.userId,
          credit: false,
          amount: amt,
          balanceAfter,
          reason: input.reason ?? input.description,
          reference: input.referenceId.trim(),
        });
      } catch {
        /* email must not break ledger */
      }
    }
    return { balanceAfter, txnId };
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

/**
 * Debit shipping for an order once (idempotent). Returns skip reason if duplicate or zero amount.
 */
export async function debitShipmentChargeIfApplicable(params: {
  order: IOrder;
  shippingCharges: unknown;
}): Promise<
  | { applied: true; amount: number; txnId: string; balanceAfter: number }
  | { applied: false; reason: "no_billable_user" | "zero_amount" | "duplicate" | "insufficient" }
> {
  const billUserId = orderWalletUserId(params.order);
  if (!billUserId) return { applied: false, reason: "no_billable_user" };

  const raw = Number(params.shippingCharges);
  const amount = roundMoney(Number.isFinite(raw) && raw > 0 ? raw : 0);
  if (!(amount > 0)) return { applied: false, reason: "zero_amount" };

  const referenceId = `shipment:${String(params.order.orderId)}`;
  try {
    const r = await debitWallet({
      userId: billUserId,
      amount,
      description: `Shipping — order ${params.order.orderId} (₹${amount})`,
      ledgerType: "shipping",
      referenceType: "shipment",
      referenceId,
      reason: "Shipment / courier charge",
    });
    return { applied: true, amount, txnId: r.txnId, balanceAfter: r.balanceAfter };
  } catch (e) {
    if (e instanceof AppError && e.statusCode === 409) {
      return { applied: false, reason: "duplicate" };
    }
    if (e instanceof AppError && e.statusCode === 402) {
      return { applied: false, reason: "insufficient" };
    }
    throw e;
  }
}

export async function adminAdjustWallet(params: {
  targetUserId: Types.ObjectId;
  /** Positive = credit, negative = debit */
  signedAmount: number;
  reason: string;
  adminUserId: Types.ObjectId;
}): Promise<{ balanceAfter: number; txnId: string }> {
  const raw = roundMoney(params.signedAmount);
  if (!Number.isFinite(raw) || raw === 0) {
    throw new AppError(400, "Adjustment amount must be a non-zero finite number");
  }
  const reason = String(params.reason || "").trim();
  if (reason.length < 3) throw new AppError(400, "Reason must be at least 3 characters");

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const wallet = await ensureWalletDoc(params.targetUserId, session);
    const balanceBefore = roundMoney(wallet.balance ?? 0);
    const amt = roundMoney(Math.abs(raw));
    let balanceAfter: number;
    let type: "Credit" | "Debit";
    let ledgerType: string;

    if (raw > 0) {
      type = "Credit";
      ledgerType = "admin_adjustment_credit";
      balanceAfter = roundMoney(balanceBefore + amt);
    } else {
      type = "Debit";
      ledgerType = "admin_adjustment_debit";
      if (balanceBefore < amt) {
        throw new AppError(402, "Insufficient wallet balance for this debit adjustment");
      }
      balanceAfter = roundMoney(balanceBefore - amt);
    }

    wallet.balance = balanceAfter;
    await wallet.save({ session });

    const txnId = `ADJ-${Date.now()}-${randomBytes(3).toString("hex")}`;
    const refId = `admin:${String(params.adminUserId)}:${txnId}`;
    await insertTransaction(
      {
        userId: params.targetUserId,
        txnId,
        date: new Date().toISOString().slice(0, 10),
        description: `Admin adjustment (${type}) — ${reason}`,
        type,
        amount: amt,
        balance: balanceAfter,
        balanceBefore,
        status: "completed",
        ledgerType,
        referenceType: "adjustment",
        referenceId: refId,
        reason: `${reason} (by admin ${String(params.adminUserId)})`,
      } as Record<string, unknown>,
      session
    );

    await session.commitTransaction();
    try {
      const { sendWalletTxnEmail } = await import("./email/emailService.js");
      await sendWalletTxnEmail({
        userId: params.targetUserId,
        credit: raw > 0,
        amount: amt,
        balanceAfter,
        reason,
        reference: refId,
      });
    } catch {
      /* non-fatal */
    }
    return { balanceAfter, txnId };
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}
