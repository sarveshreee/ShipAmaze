import type { Response } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorMiddleware.js";
import {
  KycProfile,
  kycStatusToLegacy,
  legacyStatusToKyc,
  type KycStatus,
  type IKycProfile,
} from "../models/KycProfile.js";
import { Dropshipper } from "../models/Dropshipper.js";
import { User } from "../models/User.js";
import { assertOwnerAdmin } from "../utils/staffPermissions.js";
import { createInAppNotification } from "../services/inAppNotifications.js";

const TERMS_VERSION = "2026-06-01";

const docSchema = z.object({
  pan: z.string().optional(),
  aadhaar: z.string().optional(),
  aadhaarFront: z.string().optional(),
  aadhaarBack: z.string().optional(),
  aadhaar_front: z.string().optional(),
  aadhaar_back: z.string().optional(),
  gst: z.string().optional(),
  cin: z.string().optional(),
  reg: z.string().optional(),
  auth_id: z.string().optional(),
});

const kycDraftSchema = z.object({
  account_type: z.enum(["individual", "company"]).optional(),
  accountType: z.enum(["individual", "company"]).optional(),
  business_name: z.string().optional(),
  businessName: z.string().optional(),
  full_name: z.string().optional(),
  fullName: z.string().optional(),
  dob: z.string().optional(),
  gst_number: z.string().optional(),
  gstNumber: z.string().optional(),
  pan_number: z.string().optional(),
  panNumber: z.string().optional(),
  aadhaar_number: z.string().optional(),
  aadhaarNumber: z.string().optional(),
  cin_number: z.string().optional(),
  cinNumber: z.string().optional(),
  authorized_person_name: z.string().optional(),
  authorizedPersonName: z.string().optional(),
  authorized_person_pan: z.string().optional(),
  authorizedPersonPan: z.string().optional(),
  address: z.string().optional(),
  uploaded_docs: docSchema.optional(),
  documents: docSchema.optional(),
  termsAccepted: z.boolean().optional(),
});

function mapKycResponse(k: IKycProfile | null | undefined) {
  if (!k) {
    return {
      status: "draft" as const,
      kycStatus: "pending_kyc" as KycStatus,
      account_type: "individual",
      uploaded_docs: {},
      documents: {},
    };
  }
  const legacyDocs = (k.data?.uploaded_docs as Record<string, string>) ?? {};
  const legacyAadhaar = k.documents?.aadhaar ?? legacyDocs.aadhaar;
  const docs = {
    pan: k.documents?.pan ?? legacyDocs.pan,
    aadhaar: legacyAadhaar,
    aadhaarFront: k.documents?.aadhaarFront ?? legacyDocs.aadhaarFront ?? legacyDocs.aadhaar_front ?? legacyAadhaar,
    aadhaarBack: k.documents?.aadhaarBack ?? legacyDocs.aadhaarBack ?? legacyDocs.aadhaar_back,
    gst: k.documents?.gst ?? legacyDocs.gst,
    cin: k.documents?.cin ?? legacyDocs.cin,
    reg: k.documents?.reg ?? legacyDocs.reg,
    auth_id: k.documents?.auth_id ?? legacyDocs.auth_id,
  };
  return {
    status: kycStatusToLegacy(k.status),
    kycStatus: k.status,
    account_type: k.accountType ?? (k.data?.account_type as string) ?? "individual",
    business_name: k.businessName ?? (k.data?.business_name as string) ?? "",
    full_name: k.fullName ?? (k.data?.full_name as string) ?? "",
    dob: k.dob ?? (k.data?.dob as string) ?? "",
    gst_number: k.gstNumber ?? (k.data?.gst_number as string) ?? "",
    pan_number: k.panNumber ?? (k.data?.pan_number as string) ?? "",
    aadhaar_number: k.aadhaarNumber ?? (k.data?.aadhaar_number as string) ?? "",
    cin_number: k.cinNumber ?? (k.data?.cin_number as string) ?? "",
    authorized_person_name: k.authorizedPersonName ?? (k.data?.authorized_person_name as string) ?? "",
    authorized_person_pan: k.authorizedPersonPan ?? (k.data?.authorized_person_pan as string) ?? "",
    address: k.address ?? (k.data?.address as string) ?? "",
    uploaded_docs: docs,
    documents: docs,
    rejectionRemark: k.rejectionRemark ?? "",
    termsAcceptedAt: k.termsAcceptedAt,
    reviewedAt: k.reviewedAt,
  };
}

function parseDraft(body: z.infer<typeof kycDraftSchema>) {
  const accountType = body.accountType ?? body.account_type ?? "individual";
  const docs = body.documents ?? body.uploaded_docs ?? {};
  return {
    accountType: accountType as "individual" | "company",
    businessName: String(body.businessName ?? body.business_name ?? "").trim(),
    fullName: String(body.fullName ?? body.full_name ?? "").trim(),
    dob: String(body.dob ?? "").trim(),
    gstNumber: String(body.gstNumber ?? body.gst_number ?? "").trim(),
    panNumber: String(body.panNumber ?? body.pan_number ?? "").trim().toUpperCase(),
    aadhaarNumber: String(body.aadhaarNumber ?? body.aadhaar_number ?? "").replace(/\s/g, ""),
    cinNumber: String(body.cinNumber ?? body.cin_number ?? "").trim(),
    authorizedPersonName: String(body.authorizedPersonName ?? body.authorized_person_name ?? "").trim(),
    authorizedPersonPan: String(body.authorizedPersonPan ?? body.authorized_person_pan ?? "").trim().toUpperCase(),
    address: String(body.address ?? "").trim(),
    documents: {
      pan: docs.pan,
      aadhaar: docs.aadhaar,
      aadhaarFront: docs.aadhaarFront ?? docs.aadhaar_front,
      aadhaarBack: docs.aadhaarBack ?? docs.aadhaar_back,
      gst: docs.gst,
      cin: docs.cin,
      reg: docs.reg,
      auth_id: docs.auth_id,
    },
    termsAccepted: body.termsAccepted === true,
  };
}

function assertEditable(status: KycStatus) {
  if (status === "pending_approval") throw new AppError(400, "KYC is pending admin review and cannot be edited");
  if (status === "approved") throw new AppError(400, "KYC is already approved");
}

export const getMyKyc = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const k = await KycProfile.findOne({ userId: req.user._id });
  res.json(mapKycResponse(k));
});

export const saveMyKycDraft = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = kycDraftSchema.parse(req.body);
  const parsed = parseDraft(body);

  let k = await KycProfile.findOne({ userId: req.user._id });
  const currentStatus = k?.status ?? "pending_kyc";
  assertEditable(currentStatus);

  const nextStatus: KycStatus = currentStatus === "rejected" ? "pending_kyc" : currentStatus;
  const update: Partial<IKycProfile> = {
    userId: req.user._id,
    accountType: parsed.accountType,
    businessName: parsed.businessName,
    fullName: parsed.fullName,
    dob: parsed.dob,
    gstNumber: parsed.gstNumber,
    panNumber: parsed.panNumber,
    aadhaarNumber: parsed.aadhaarNumber,
    cinNumber: parsed.cinNumber,
    authorizedPersonName: parsed.authorizedPersonName,
    authorizedPersonPan: parsed.authorizedPersonPan,
    address: parsed.address,
    documents: parsed.documents,
    status: nextStatus,
    data: { ...((k?.data as Record<string, unknown>) ?? {}), ...req.body },
  };
  if (parsed.termsAccepted && !k?.termsAcceptedAt) {
    update.termsAcceptedAt = new Date();
    update.termsVersion = TERMS_VERSION;
  }

  k = await KycProfile.findOneAndUpdate({ userId: req.user._id }, update, { upsert: true, new: true });
  res.json(mapKycResponse(k));
});

export const submitMyKyc = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.user) throw new AppError(401, "Unauthorized");
  const body = kycDraftSchema.parse(req.body);
  const parsed = parseDraft(body);

  const k = await KycProfile.findOne({ userId: req.user._id });
  const currentStatus = k?.status ?? "pending_kyc";
  assertEditable(currentStatus);

  if (!k?.termsAcceptedAt && !parsed.termsAccepted) {
    throw new AppError(400, "You must accept Terms & Conditions before submitting KYC");
  }

  const errs: string[] = [];
  if (parsed.accountType === "individual") {
    if (!parsed.fullName) errs.push("Full name");
    if (!parsed.dob) errs.push("Date of birth");
    if (!parsed.panNumber || !/^[A-Z]{5}\d{4}[A-Z]$/.test(parsed.panNumber)) errs.push("Valid PAN");
    if (!parsed.aadhaarNumber || parsed.aadhaarNumber.length !== 12) errs.push("Valid Aadhaar");
    if (!parsed.documents.pan) errs.push("PAN document");
    const aadhaarFront = parsed.documents.aadhaarFront || parsed.documents.aadhaar;
    if (!aadhaarFront) errs.push("Aadhaar front document");
    if (!parsed.documents.aadhaarBack) errs.push("Aadhaar back document");
  } else {
    if (!parsed.businessName) errs.push("Business name");
    if (!parsed.panNumber) errs.push("PAN number");
    if (!parsed.gstNumber) errs.push("GST number");
    if (!parsed.cinNumber) errs.push("CIN / Registration number");
    if (!parsed.documents.pan) errs.push("PAN document");
    if (!parsed.documents.gst) errs.push("GST certificate document");
    if (!parsed.documents.cin) errs.push("CIN document");
  }
  if (!parsed.address) errs.push("Address");
  if (errs.length) throw new AppError(400, `Missing or invalid: ${errs.join(", ")}`);

  const updated = await KycProfile.findOneAndUpdate(
    { userId: req.user._id },
    {
      userId: req.user._id,
      accountType: parsed.accountType,
      businessName: parsed.businessName,
      fullName: parsed.fullName,
      dob: parsed.dob,
      gstNumber: parsed.gstNumber,
      panNumber: parsed.panNumber,
      aadhaarNumber: parsed.aadhaarNumber,
      cinNumber: parsed.cinNumber,
      authorizedPersonName: parsed.authorizedPersonName,
      authorizedPersonPan: parsed.authorizedPersonPan,
      address: parsed.address,
      documents: parsed.documents,
      status: "pending_approval",
      rejectionRemark: "",
      ...(parsed.termsAccepted ? { termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION } : {}),
      data: { ...(k?.data ?? {}), ...req.body, status: "pending" },
    },
    { upsert: true, new: true }
  );

  await Dropshipper.findOneAndUpdate(
    { userId: req.user._id },
    { kycVerified: false, accessType: "RESTRICTED" },
    { upsert: true }
  );

  res.json(mapKycResponse(updated));
});

function assertAdminOwner(req: AuthRequest) {
  if (!req.user || req.user.role !== "admin") throw new AppError(403, "Forbidden");
  assertOwnerAdmin(req.user);
}

export const listKycForAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdminOwner(req);
  const statusFilter = String(req.query.status ?? "").trim();
  const q = String(req.query.q ?? "").trim().toLowerCase();

  const filter: Record<string, unknown> = {};
  if (statusFilter && statusFilter !== "all") {
    const mapped = legacyStatusToKyc(statusFilter) ?? (statusFilter as KycStatus);
    filter.status = mapped;
  } else if (!statusFilter) {
    filter.status = "pending_approval";
  }

  const rows = await KycProfile.find(filter).sort({ updatedAt: -1 }).limit(200).lean();
  const userIds = rows.map((r) => r.userId);
  const users = await User.find({ _id: { $in: userIds } })
    .select("name email companyName phone status")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  let mapped = rows.map((r) => {
    const u = userMap.get(String(r.userId));
    return {
      userId: String(r.userId),
      name: u?.name ?? "",
      email: u?.email ?? "",
      companyName: u?.companyName ?? "",
      phone: u?.phone ?? "",
      userStatus: u?.status ?? "active",
      ...mapKycResponse(r as unknown as IKycProfile),
      submittedAt: r.updatedAt,
    };
  });

  if (q) {
    mapped = mapped.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.business_name ?? "").toLowerCase().includes(q) ||
        (r.pan_number ?? "").toLowerCase().includes(q)
    );
  }

  res.json(mapped);
});

export const getKycForAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdminOwner(req);
  const userId = req.params.userId;
  if (!mongoose.isValidObjectId(userId)) throw new AppError(400, "Invalid userId");
  const k = await KycProfile.findOne({ userId }).lean();
  const u = await User.findById(userId).select("name email companyName phone status").lean();
  if (!k && !u) throw new AppError(404, "Not found");
  res.json({
    userId,
    name: u?.name ?? "",
    email: u?.email ?? "",
    companyName: u?.companyName ?? "",
    phone: u?.phone ?? "",
    userStatus: u?.status ?? "active",
    ...mapKycResponse(k as unknown as IKycProfile),
  });
});

export const approveKyc = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdminOwner(req);
  const userId = req.params.userId;
  if (!mongoose.isValidObjectId(userId)) throw new AppError(400, "Invalid userId");

  const k = await KycProfile.findOne({ userId });
  if (!k) throw new AppError(404, "KYC profile not found");
  if (k.status !== "pending_approval") throw new AppError(400, "Only pending KYC can be approved");

  k.status = "approved";
  k.rejectionRemark = "";
  k.reviewedBy = req.user!._id;
  k.reviewedAt = new Date();
  k.data = { ...(k.data ?? {}), status: "verified" };
  await k.save();

  await Dropshipper.findOneAndUpdate(
    { userId },
    { kycVerified: true, accessType: "FULL", status: "Active" },
    { upsert: true }
  );
  await User.findByIdAndUpdate(userId, { status: "active" });

  await createInAppNotification(
    new mongoose.Types.ObjectId(userId),
    "kyc_update",
    "KYC approved",
    "Your KYC has been approved. Your account is now active.",
    { link: "/dropshipper/settings" }
  );

  res.json({ ok: true, ...mapKycResponse(k) });
});

export const rejectKyc = asyncHandler(async (req: AuthRequest, res: Response) => {
  assertAdminOwner(req);
  const userId = req.params.userId;
  const remark = String(req.body.remark ?? req.body.rejectionRemark ?? "").trim();
  if (!remark) throw new AppError(400, "Rejection remark is required");
  if (!mongoose.isValidObjectId(userId)) throw new AppError(400, "Invalid userId");

  const k = await KycProfile.findOne({ userId });
  if (!k) throw new AppError(404, "KYC profile not found");
  if (k.status !== "pending_approval") throw new AppError(400, "Only pending KYC can be rejected");

  k.status = "rejected";
  k.rejectionRemark = remark;
  k.reviewedBy = req.user!._id;
  k.reviewedAt = new Date();
  k.data = { ...(k.data ?? {}), status: "rejected" };
  await k.save();

  await Dropshipper.findOneAndUpdate(
    { userId },
    { kycVerified: false, accessType: "RESTRICTED" },
    { upsert: true }
  );

  await createInAppNotification(
    new mongoose.Types.ObjectId(userId),
    "kyc_update",
    "KYC rejected",
    remark,
    { link: "/dropshipper/settings" }
  );

  res.json({ ok: true, ...mapKycResponse(k) });
});

export { TERMS_VERSION };
