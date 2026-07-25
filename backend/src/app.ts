import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { getUploadsRoot } from "./services/productImageService.js";
import { errorMiddleware } from "./middleware/errorMiddleware.js";
import { notFoundHandler } from "./middleware/notFound.js";
import {
  authRouteLimiter,
  passwordResetLimiter,
  emailOtpVerifyLimiter,
  emailOtpSendLimiter,
  emailOtpResendLimiter,
  publicTrackingLimiter,
  shopifyCallbackLimiter,
  shopifyConnectLimiter,
} from "./middleware/rateLimits.js";
import { authMiddleware, type AuthRequest } from "./middleware/authMiddleware.js";
import { requireRoles } from "./middleware/roleMiddleware.js";
import { requireOwnerAdmin, requireStaffPermission } from "./middleware/staffPermissionMiddleware.js";
import { STAFF_PERMISSIONS } from "./utils/staffPermissions.js";
import * as authController from "./controllers/authController.js";
import * as orderController from "./controllers/orderController.js";
import * as resourceController from "./controllers/resourceController.js";
import * as accountController from "./controllers/accountController.js";
import * as productDetailController from "./controllers/productDetailController.js";
import * as productImageController from "./controllers/productImageController.js";
import * as shopifyController from "./controllers/shopifyController.js";
import velocityRouter from "./modules/velocity/velocity.routes.js";
import lorrigoRouter from "./modules/lorrigo/lorrigo.routes.js";
import courierDiscoveryRouter from "./modules/courier/discovery.routes.js";
import { registerCourierProviders } from "./modules/courier/index.js";
import * as debugController from "./controllers/debugController.js";
import * as walletController from "./controllers/walletController.js";
import * as notificationController from "./controllers/notificationController.js";
import * as adminWorkflowController from "./controllers/adminWorkflowController.js";
import * as loginActivityController from "./controllers/loginActivityController.js";
import * as userActivityController from "./controllers/userActivityController.js";
import * as approvalController from "./controllers/approvalController.js";
import * as reportsController from "./controllers/reportsController.js";
import * as invoiceController from "./controllers/invoiceController.js";
import * as labelInvoiceSettingsController from "./controllers/labelInvoiceSettingsController.js";
import * as profitCalculatorSettingsController from "./controllers/profitCalculatorSettingsController.js";
import * as courierPriorityController from "./controllers/courierPriorityController.js";
import * as bulkCourierPriorityController from "./controllers/bulkCourierPriorityController.js";
import * as courierRateController from "./controllers/courierRateController.js";
import {
  requireDropshipperWarehouseAccess,
  requireFullDropshipper,
} from "./middleware/dropshipperAccessMiddleware.js";
import * as kycController from "./controllers/kycController.js";
import * as categoryController from "./controllers/categoryController.js";
import * as cloudinaryMigrationController from "./controllers/cloudinaryMigrationController.js";
import { devLog } from "./utils/devLog.js";

function normalizeCorsOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function parseDelimitedOrigins(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw.split(",").map(normalizeCorsOrigin).filter((origin): origin is string => Boolean(origin));
}

function parseCorsOrigins(): string[] {
  return Array.from(
    new Set([
      ...parseDelimitedOrigins(process.env.CORS_ORIGIN),
      ...parseDelimitedOrigins(process.env.FRONTEND_URL),
    ])
  );
}

/** localhost / 127.0.0.1 / ngrok — browser origin may differ from http://localhost:8080. */
function isLocalDevOrigin(origin: string): boolean {
  try {
    const { hostname, protocol } = new URL(origin);
    if (protocol !== "http:" && protocol !== "https:") return false;
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
    return (
      hostname.endsWith(".ngrok-free.dev") ||
      hostname.endsWith(".ngrok-free.app") ||
      hostname.endsWith(".ngrok.io") ||
      hostname.endsWith(".ngrok.app")
    );
  } catch {
    return false;
  }
}

function apiTimingLogger(req: express.Request, res: express.Response, next: express.NextFunction) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const length = res.getHeader("content-length");
    const size = typeof length === "number" || typeof length === "string" ? ` ${length}b` : "";
    const marker = elapsedMs >= 1_000 ? " SLOW" : "";
    devLog.info(
      `[api:timing]${marker} ${req.method} ${req.originalUrl} ${res.statusCode} ${elapsedMs.toFixed(0)}ms${size}`
    );
  });
  next();
}

function migrationRequestLogger(req: express.Request, res: express.Response, next: express.NextFunction) {
  const start = process.hrtime.bigint();
  const origin = req.get("origin") ?? "none";
  const enabled = process.env.CLOUDINARY_MIGRATION_ENABLED?.trim().toLowerCase() === "true";
  devLog.info(
    `[cloudinary-migration:req] start ${req.method} ${req.originalUrl} origin=${origin} enabled=${enabled}`
  );
  res.on("finish", () => {
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    devLog.info(
      `[cloudinary-migration:req] finish ${req.method} ${req.originalUrl} status=${res.statusCode} ${elapsedMs.toFixed(0)}ms`
    );
  });
  next();
}

export function createApp() {
  registerCourierProviders();
  const app = express();
  const isProd = process.env.NODE_ENV === "production";
  const corsAllowed = parseCorsOrigins();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(compression());
  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "shipamaze-api", uptimeSeconds: Math.floor(process.uptime()) });
  });

  app.use(
    cors({
      origin(origin, callback) {
        if (!isProd && corsAllowed.length === 0) {
          return callback(null, origin || true);
        }
        if (!isProd && origin && isLocalDevOrigin(origin)) {
          return callback(null, true);
        }
        if (isProd) {
          if (!origin) {
            return callback(null, false);
          }
          if (corsAllowed.includes(origin)) {
            return callback(null, true);
          }
          console.warn(`[cors] blocked origin=${origin} allowed=${corsAllowed.join(",") || "none"}`);
          return callback(null, false);
        }
        if (!origin) {
          return callback(null, true);
        }
        if (corsAllowed.length === 0 || corsAllowed.includes(origin)) {
          return callback(null, true);
        }
        if (origin && isLocalDevOrigin(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
    })
  );

  /** Shopify webhooks require raw body for HMAC verification (must be before express.json). */
  app.post(
    "/api/shopify/webhooks",
    express.raw({ type: "application/json", limit: "2mb" }),
    (req, res, next) => {
      void shopifyController.handleWebhook(req, res).catch(next);
    }
  );
  const jsonLimit = process.env.JSON_BODY_LIMIT?.trim() || (isProd ? "10mb" : "10mb");
  app.use(express.json({ limit: jsonLimit }));

  /** Optimized product WebP assets — long-lived browser cache. */
  app.use(
    "/api/media/products",
    express.static(getUploadsRoot(), {
      maxAge: "365d",
      immutable: true,
      fallthrough: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith(".webp")) {
          res.setHeader("Content-Type", "image/webp");
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        }
      },
    })
  );

  const api = express.Router();

  api.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "shipamaze-api",
      gitCommit: process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? null,
      imageRoute: true,
    });
  });

  api.post("/auth/register", authRouteLimiter, authController.register);
  api.post("/auth/login", authRouteLimiter, authController.login);
  api.post("/auth/send-otp", emailOtpSendLimiter, authController.sendOtp);
  api.post("/auth/verify-otp", emailOtpVerifyLimiter, authController.verifyOtp);
  api.post("/auth/resend-otp", emailOtpResendLimiter, authController.resendOtp);
  api.post("/auth/verify-email-otp", emailOtpVerifyLimiter, authController.verifyEmailOtp);
  api.post("/auth/resend-email-otp", emailOtpResendLimiter, authController.resendEmailVerificationOtp);
  api.post("/auth/forgot-password", passwordResetLimiter, authController.forgotPassword);
  api.post("/auth/reset-password", passwordResetLimiter, authController.resetPasswordWithOtp);
  api.get("/auth/me", authMiddleware, authController.me);
  api.get("/auth/profile", authMiddleware, authController.me);
  api.put("/users/profile", authMiddleware, authController.updateProfile);
  api.patch("/auth/profile", authMiddleware, authController.updateProfile);
  api.post("/auth/logout", authMiddleware, authController.logout);
  api.post("/auth/change-password", authMiddleware, authController.changePassword);
  api.patch("/auth/change-password", authMiddleware, authController.changePassword);

  api.get("/orders/track/:awb", publicTrackingLimiter, orderController.trackOrderByAwb);
  api.get("/orders/public/:orderId", publicTrackingLimiter, orderController.publicOrderByOrderId);
  api.get(
    "/public/settings/label-invoice",
    publicTrackingLimiter,
    labelInvoiceSettingsController.getPublicLabelInvoiceSettings
  );

  api.get("/orders", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.ORDERS_VIEW), orderController.listOrders);
  api.get("/orders/:orderId", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.ORDERS_VIEW), orderController.getOrderById);
  api.post("/orders", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.ORDERS_CREATE), orderController.createOrder);
  api.post("/orders/bulk", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.ORDERS_CREATE), orderController.createOrdersBulk);
  api.post("/orders/bulk-move", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.ORDERS_EDIT), orderController.bulkMoveOrders);
  api.post("/orders/create-shipment", authMiddleware, requireFullDropshipper, orderController.createShipment);
  api.post("/orders/process-selected", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.ORDERS_EDIT), orderController.processSelectedOrders);
  api.patch(
    "/orders/:orderId/line-items/:lineIndex/sku",
    authMiddleware,
    requireRoles("admin"),
    orderController.patchOrderLineItemSku
  );
  api.get("/orders/:orderId/sku-audit", authMiddleware, orderController.listOrderSkuAudit);
  api.post("/orders/:id/junk", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.ORDERS_EDIT), orderController.markOrderJunk);
  api.delete("/orders/:id", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.ORDERS_EDIT), orderController.deleteJunkOrder);
  api.post("/orders/bulk-delete-junk", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.ORDERS_EDIT), orderController.bulkDeleteJunkOrders);
  api.post("/orders/:id/reship", authMiddleware, orderController.markOrderReship);
  api.patch("/orders/:orderId/status", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.ORDERS_EDIT), orderController.updateOrderStatus);
  api.put("/orders/:orderId", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.ORDERS_EDIT), orderController.updateOrder);

  api.get("/settings/label-invoice", authMiddleware, labelInvoiceSettingsController.getLabelInvoiceSettings);
  api.put(
    "/settings/label-invoice",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    labelInvoiceSettingsController.putLabelInvoiceSettings
  );
  api.post(
    "/settings/label-invoice/resolve-logos",
    authMiddleware,
    labelInvoiceSettingsController.resolveOrderLabelLogos
  );
  api.get("/account/label-logo", authMiddleware, requireRoles("dropshipper"), labelInvoiceSettingsController.getMyLabelLogo);
  api.put("/account/label-logo", authMiddleware, requireRoles("dropshipper"), labelInvoiceSettingsController.putMyLabelLogo);
  api.delete("/account/label-logo", authMiddleware, requireRoles("dropshipper"), labelInvoiceSettingsController.deleteMyLabelLogo);

  api.get("/settings/profit-calculator", authMiddleware, profitCalculatorSettingsController.getProfitCalculatorSettings);
  api.put(
    "/settings/profit-calculator",
    authMiddleware,
    requireRoles("admin"),
    profitCalculatorSettingsController.putProfitCalculatorSettings
  );

  api.get("/products/marketplace", authMiddleware, resourceController.listMarketplaceProducts);
  api.get("/products/next-sku", authMiddleware, resourceController.getNextProductSku);
  api.get("/products", authMiddleware, resourceController.listProducts);
  api.post("/products", authMiddleware, resourceController.createProduct);
  api.put("/products/:id", authMiddleware, resourceController.updateProduct);
  api.delete("/products/:id", authMiddleware, resourceController.deleteProduct);
  api.get("/products/:id/thumbnail", authMiddleware, productDetailController.getProductThumbnail);
  api.get("/products/image/:productId/:index/:size", (req, res, next) => {
    productImageController.serveProductImageAsset(req, res).catch(next);
  });
  api.get("/products/:id/variants", authMiddleware, productDetailController.getProductVariants);
  api.get("/products/detail/:id", authMiddleware, productDetailController.getProductById);

  api.get("/vendors", authMiddleware, requireDropshipperWarehouseAccess, resourceController.listVendors);
  api.post("/vendors", authMiddleware, requireDropshipperWarehouseAccess, resourceController.createVendor);
  api.patch("/vendors/:id", authMiddleware, requireDropshipperWarehouseAccess, resourceController.updateVendorSelfService);
  api.delete("/vendors/:id", authMiddleware, requireDropshipperWarehouseAccess, resourceController.deleteVendorSelfService);
  api.get("/vendors/accounts", authMiddleware, resourceController.listVendorAccounts);
  api.get("/dropshippers", authMiddleware, resourceController.listDropshippers);
  api.get("/users/by-role", authMiddleware, resourceController.listUsersByRole);

  api.get("/notifications", authMiddleware, notificationController.listMyNotifications);
  api.patch("/notifications/:id/read", authMiddleware, notificationController.markNotificationRead);
  api.post("/notifications/read-all", authMiddleware, notificationController.markAllNotificationsRead);
  api.delete("/notifications", authMiddleware, notificationController.clearAllNotifications);

  api.get("/support/tickets", authMiddleware, adminWorkflowController.userListMySupportTickets);
  api.post("/support/tickets", authMiddleware, adminWorkflowController.userCreateSupportTicket);
  api.get("/support/tickets/:id", authMiddleware, adminWorkflowController.userGetSupportTicket);
  api.post("/support/tickets/:id/comments", authMiddleware, adminWorkflowController.userAddSupportComment);

  api.get(
    "/admin/catalogue/products",
    authMiddleware,
    requireRoles("admin"),
    adminWorkflowController.adminListCatalogueProducts
  );
  api.patch(
    "/admin/catalogue/products/:id",
    authMiddleware,
    requireRoles("admin"),
    adminWorkflowController.adminPatchCatalogueProduct
  );
  api.post(
    "/admin/catalogue/products/bulk",
    authMiddleware,
    requireRoles("admin"),
    adminWorkflowController.adminBulkCatalogueProducts
  );
  api.use("/admin/cloudinary-migration", migrationRequestLogger);
  api.get(
    "/admin/cloudinary-migration/test",
    cloudinaryMigrationController.test
  );
  api.get(
    "/admin/cloudinary-migration/status",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    cloudinaryMigrationController.status
  );
  api.post(
    "/admin/cloudinary-migration/batch",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    cloudinaryMigrationController.runBatch
  );
  api.get(
    "/admin/cloudinary-migration/verify",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    cloudinaryMigrationController.verify
  );

  api.get("/shipping-rate-card", authMiddleware, approvalController.getShippingRateCard);
  api.post(
    "/admin/shipping-rate-card",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    approvalController.adminSaveShippingRateCard
  );
  api.post(
    "/admin/couriers/direct",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    approvalController.adminUpsertCourier
  );
  api.post("/shipping-rate-change-requests", authMiddleware, approvalController.submitShippingRateChange);
  api.get("/shipping-rate-approvals", authMiddleware, approvalController.listShippingRateApprovals);
  api.get("/product-price-approvals", authMiddleware, approvalController.listProductPriceApprovals);
  api.patch(
    "/admin/shipping-rate-approvals/:id/approve",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    approvalController.approveShippingRateApproval
  );
  api.patch(
    "/admin/shipping-rate-approvals/:id/reject",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    approvalController.rejectShippingRateApproval
  );
  api.patch(
    "/admin/product-price-approvals/:id/approve",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    approvalController.approveProductPriceApproval
  );
  api.patch(
    "/admin/product-price-approvals/:id/reject",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    approvalController.rejectProductPriceApproval
  );

  api.get(
    "/admin/staff/admins",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    adminWorkflowController.adminListAdminUsers
  );

  api.post(
    "/admin/users/create",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    adminWorkflowController.adminCreateUser
  );
  api.get("/admin/users", authMiddleware, requireRoles("admin"), requireOwnerAdmin, adminWorkflowController.adminListUsers);
  api.get("/admin/users/:id", authMiddleware, requireRoles("admin"), requireOwnerAdmin, adminWorkflowController.adminGetUser);
  api.patch("/admin/users/:id", authMiddleware, requireRoles("admin"), requireOwnerAdmin, adminWorkflowController.adminPatchUser);
  api.post(
    "/admin/users/:id/reset-password",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    adminWorkflowController.adminResetUserPassword
  );

  api.get("/admin/vendors", authMiddleware, requireRoles("admin"), requireOwnerAdmin, adminWorkflowController.adminListVendors);
  api.get("/admin/vendors/:id", authMiddleware, requireRoles("admin"), requireOwnerAdmin, adminWorkflowController.adminGetVendor);
  api.patch("/admin/vendors/:id", authMiddleware, requireRoles("admin"), requireOwnerAdmin, adminWorkflowController.adminPatchVendor);

  api.get(
    "/admin/dropshippers",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    adminWorkflowController.adminListDropshippers
  );
  api.get(
    "/admin/dropshippers/:id",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    adminWorkflowController.adminGetDropshipper
  );
  api.patch(
    "/admin/dropshippers/:id",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    adminWorkflowController.adminPatchDropshipper
  );

  api.get(
    "/admin/support/tickets",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    adminWorkflowController.adminListSupportTickets
  );
  api.get(
    "/admin/support/tickets/:id",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    adminWorkflowController.adminGetSupportTicket
  );
  api.patch(
    "/admin/support/tickets/:id",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    adminWorkflowController.adminPatchSupportTicket
  );
  api.post(
    "/admin/support/tickets/:id/comments",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    adminWorkflowController.adminAddSupportComment
  );

  api.get(
    "/admin/security/login-activity",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    loginActivityController.adminListLoginActivity
  );
  api.get(
    "/admin/activity-logs",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    userActivityController.adminListUserActivity
  );
  api.get(
    "/admin/activity-logs/modules",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    userActivityController.adminListActivityModules
  );

  api.get("/warehouses", authMiddleware, requireDropshipperWarehouseAccess, resourceController.listWarehouses);
  api.post("/warehouses", authMiddleware, requireDropshipperWarehouseAccess, resourceController.createWarehouse);
  api.patch("/warehouses/:id", authMiddleware, requireDropshipperWarehouseAccess, resourceController.updateWarehouse);
  api.delete("/warehouses/:id", authMiddleware, requireDropshipperWarehouseAccess, resourceController.deleteWarehouse);

  api.get("/couriers", authMiddleware, resourceController.listCouriers);
  api.post("/couriers", authMiddleware, resourceController.upsertCourier);
  api.post("/couriers/seed-defaults", authMiddleware, requireRoles("admin"), resourceController.seedDefaultCouriersEndpoint);

  api.get(
    "/admin/courier-priority-rules",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    courierPriorityController.listCourierPriorityRules
  );
  api.post(
    "/admin/courier-priority-rules",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    courierPriorityController.createCourierPriorityRule
  );
  api.patch(
    "/admin/courier-priority-rules/:id",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    courierPriorityController.updateCourierPriorityRule
  );
  api.delete(
    "/admin/courier-priority-rules/:id",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    courierPriorityController.deleteCourierPriorityRule
  );
  api.post(
    "/admin/courier-priority-rules/reorder",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    courierPriorityController.reorderCourierPriorityRules
  );
  api.post(
    "/admin/courier-priority-rules/evaluate",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    courierPriorityController.evaluateCourierPriority
  );

  api.get(
    "/admin/bulk-courier-priority",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    bulkCourierPriorityController.getBulkCourierPrioritySettings
  );
  api.put(
    "/admin/bulk-courier-priority",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    bulkCourierPriorityController.saveBulkCourierPrioritySettings
  );
  api.get(
    "/admin/bulk-courier-priority/velocity-carriers",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    bulkCourierPriorityController.listVelocityCarriersForLane
  );

  api.get("/courier-rate-masters", authMiddleware, courierRateController.listPublicCourierRateMasters);
  api.get(
    "/admin/courier-rates",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    courierRateController.listCourierRateMasters
  );
  api.get(
    "/admin/couriers/available",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    courierRateController.listAvailableCouriers
  );
  api.get(
    "/admin/courier-rates/:id",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    courierRateController.getCourierRateMaster
  );
  api.post(
    "/admin/courier-rates",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    courierRateController.createCourierRateMaster
  );
  api.patch(
    "/admin/courier-rates/:id",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    courierRateController.updateCourierRateMaster
  );
  api.delete(
    "/admin/courier-rates/:id",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    courierRateController.deleteCourierRateMaster
  );

  api.get("/pincodes", authMiddleware, resourceController.listPincodes);
  api.post("/pincodes", authMiddleware, resourceController.upsertPincode);

  api.get("/wallet", authMiddleware, resourceController.getWallet);
  api.post("/wallet/add-balance", authMiddleware, resourceController.addWalletBalance);
  api.post("/wallet/add-funds", authMiddleware, resourceController.addFunds);
  api.post("/wallet/deduct", authMiddleware, requireRoles("admin"), requireOwnerAdmin, walletController.adminDeductWallet);
  api.get("/wallet/transactions", authMiddleware, resourceController.listTransactions);
  api.get("/wallet/cod-remittances", authMiddleware, resourceController.listCodRemittances);

  api.get("/admin/wallets", authMiddleware, requireRoles("admin"), requireOwnerAdmin, walletController.adminListWallets);
  api.patch("/admin/wallets/:userId/adjust", authMiddleware, requireRoles("admin"), requireOwnerAdmin, walletController.adminAdjustWalletHandler);
  api.get("/admin/wallet-transactions", authMiddleware, requireRoles("admin"), requireOwnerAdmin, walletController.adminListWalletTransactions);

  api.get("/invoices", authMiddleware, resourceController.listInvoices);
  api.get("/invoices/:invoiceId/export.csv", authMiddleware, invoiceController.exportInvoiceCsv);
  api.get("/invoices/:invoiceId", authMiddleware, invoiceController.getInvoice);
  api.patch(
    "/invoices/:invoiceId/status",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    invoiceController.patchInvoiceStatus
  );
  api.post(
    "/invoices/:invoiceId/generate",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    invoiceController.postInvoiceGenerateStub
  );

  api.get("/dashboard/summary", authMiddleware, reportsController.getDashboardSummary);
  api.get("/reports/summary", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.ANALYTICS_VIEW), reportsController.getReportsSummary);
  api.get("/reports/orders", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.ANALYTICS_VIEW), reportsController.getReportsOrders);
  api.get("/exports/csv", authMiddleware, requireOwnerAdmin, reportsController.exportCsv);

  api.get("/ndr", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.NDR_VIEW), resourceController.listNdr);
  api.post("/ndr/:awb/action", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.NDR_MANAGE), resourceController.submitNdrAction);
  api.patch("/ndr/:awb", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.NDR_MANAGE), resourceController.updateNdr);

  api.get("/returns", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.RETURNS_VIEW), resourceController.listReturns);
  api.post("/returns", authMiddleware, resourceController.createReturn);
  api.patch("/returns/:returnId", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.RETURNS_MANAGE), resourceController.updateReturn);

  api.get("/manifests", authMiddleware, requireRoles("admin"), requireOwnerAdmin, resourceController.listManifests);

  if (process.env.NODE_ENV === "development") {
    api.get("/debug/my-pickups", authMiddleware, debugController.debugMyPickups);
  }

  api.get("/pickups", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.PICKUPS_VIEW, STAFF_PERMISSIONS.PICKUPS_MANAGE), resourceController.listPickups);
  api.post("/pickups", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.PICKUPS_MANAGE), resourceController.createPickup);

  api.post("/pickup-addresses/repair-dropshipper-ownership", authMiddleware, resourceController.repairDropshipperPickupOwnership);
  api.get("/pickup-addresses", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.PICKUPS_VIEW, STAFF_PERMISSIONS.PICKUPS_MANAGE), resourceController.listPickupAddresses);
  api.post("/pickup-addresses", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.PICKUPS_MANAGE), resourceController.createPickupAddress);
  api.put("/pickup-addresses/:id", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.PICKUPS_MANAGE), resourceController.updatePickupAddress);
  api.patch("/pickup-addresses/:id", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.PICKUPS_MANAGE), resourceController.updatePickupAddress);
  api.delete("/pickup-addresses/:id", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.PICKUPS_MANAGE), resourceController.deletePickupAddress);
  api.patch("/pickup-addresses/:id/default", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.PICKUPS_MANAGE), resourceController.setDefaultPickupAddress);

  api.get("/weight-disputes", authMiddleware, requireOwnerAdmin, resourceController.listWeightDisputes);

  api.get("/product-requests", authMiddleware, resourceController.listProductRequests);
  api.post("/product-requests", authMiddleware, resourceController.createProductRequest);
  api.put("/product-requests/:id", authMiddleware, resourceController.updateProductRequest);
  api.delete("/product-requests/:id", authMiddleware, resourceController.deleteProductRequest);

  api.get("/tab-permissions/me", authMiddleware, resourceController.getMyTabPermissions);
  api.get("/tab-permissions/defaults", authMiddleware, requireOwnerAdmin, resourceController.listTabDefaults);
  api.post("/tab-permissions/defaults", authMiddleware, requireOwnerAdmin, resourceController.upsertTabDefault);
  api.get("/tab-permissions/user", authMiddleware, requireOwnerAdmin, resourceController.listUserTabOverrides);
  api.post("/tab-permissions/user", authMiddleware, requireOwnerAdmin, resourceController.upsertUserTabOverride);
  api.delete("/tab-permissions/user", authMiddleware, requireOwnerAdmin, resourceController.resetUserTabOverrides);

  api.get("/account/kyc", authMiddleware, kycController.getMyKyc);
  api.put("/account/kyc", authMiddleware, kycController.saveMyKycDraft);
  api.post("/account/kyc/submit", authMiddleware, kycController.submitMyKyc);

  api.get("/categories", authMiddleware, categoryController.listCategories);
  api.post("/admin/categories", authMiddleware, requireRoles("admin"), categoryController.createCategory);
  api.put("/admin/categories/:id", authMiddleware, requireRoles("admin"), categoryController.updateCategory);
  api.delete("/admin/categories/:id", authMiddleware, requireRoles("admin"), categoryController.deleteCategory);
  api.post("/admin/categories/seed", authMiddleware, requireRoles("admin"), requireOwnerAdmin, categoryController.seedCategoriesAdmin);

  api.get("/admin/kyc", authMiddleware, requireRoles("admin"), requireOwnerAdmin, kycController.listKycForAdmin);
  api.get("/admin/kyc/:userId", authMiddleware, requireRoles("admin"), requireOwnerAdmin, kycController.getKycForAdmin);
  api.post("/admin/kyc/:userId/approve", authMiddleware, requireRoles("admin"), requireOwnerAdmin, kycController.approveKyc);
  api.post("/admin/kyc/:userId/reject", authMiddleware, requireRoles("admin"), requireOwnerAdmin, kycController.rejectKyc);

  api.get(
    "/admin/dropshipper-shipping-rates/:userId",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    approvalController.getDropshipperShippingRates
  );
  api.put(
    "/admin/dropshipper-shipping-rates/:userId",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    approvalController.saveDropshipperShippingRates
  );
  api.get("/account/banks", authMiddleware, accountController.listBanks);
  api.post("/account/banks", authMiddleware, accountController.createBank);
  api.patch("/account/banks/:id", authMiddleware, accountController.updateBank);
  api.delete("/account/banks/:id", authMiddleware, accountController.deleteBank);
  api.get("/account/routing", authMiddleware, accountController.getRouting);
  api.put("/account/routing", authMiddleware, accountController.putRouting);
  api.get("/account/team", authMiddleware, accountController.listTeam);
  api.post("/account/team", authMiddleware, accountController.createTeam);
  api.delete("/account/team/:id", authMiddleware, accountController.deleteTeam);
  api.post("/account/team/:id/resend", authMiddleware, accountController.resendTeam);

  // Shopify product image proxy — public so Shopify's CDN can fetch base64 product images
  api.get("/shopify/product-image/:productId/:index", (req, res, next) => {
    shopifyController.serveProductImage(req, res).catch(next);
  });

  // Shopify OAuth — install/callback are public (Shopify redirects the browser)
  api.get("/shopify/install", shopifyCallbackLimiter, shopifyController.handleInstall);
  api.post("/shopify/connect", authMiddleware, shopifyConnectLimiter, requireStaffPermission(STAFF_PERMISSIONS.CHANNELS_MANAGE), shopifyController.initiateConnect);
  api.get("/shopify/callback", shopifyCallbackLimiter, shopifyController.handleCallback);
  api.get("/shopify/status", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.CHANNELS_VIEW), shopifyController.getStatus);
  api.post("/shopify/disconnect", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.CHANNELS_MANAGE), shopifyController.disconnect);
  api.post("/shopify/sync-orders", authMiddleware, requireStaffPermission(STAFF_PERMISSIONS.CHANNELS_MANAGE), shopifyController.syncOrders);
  api.post("/shopify/sync-webhooks", authMiddleware, requireRoles("admin"), shopifyController.syncWebhooks);
  api.get(
    "/shopify/product-push/:productId",
    authMiddleware,
    requireStaffPermission(STAFF_PERMISSIONS.CHANNELS_VIEW),
    shopifyController.getProductPushStatus
  );
  api.post(
    "/shopify/push-product",
    authMiddleware,
    requireStaffPermission(STAFF_PERMISSIONS.CHANNELS_MANAGE),
    shopifyController.pushProductToShopify
  );
  api.get(
    "/shopify/admin/connections",
    authMiddleware,
    requireRoles("admin"),
    requireOwnerAdmin,
    shopifyController.listConnectionsAdmin
  );

  // Velocity Shipping courier integration
  api.use("/velocity", velocityRouter);

  // Lorrigo — Phase 2: admin status/health only (no booking routes)
  api.use("/lorrigo", lorrigoRouter);

  // Multi-provider serviceability / rates discovery (Velocity + Lorrigo)
  api.use("/courier", courierDiscoveryRouter);

  app.use("/api", apiTimingLogger, api);
  // Backward compatibility for older clients still using /api/v1/*.
  app.use("/api/v1", apiTimingLogger, api);
  app.use(notFoundHandler);
  app.use(errorMiddleware);

  return app;
}
