import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorMiddleware } from "./middleware/errorMiddleware.js";
import { notFoundHandler } from "./middleware/notFound.js";
import {
  authRouteLimiter,
  passwordResetLimiter,
  emailOtpVerifyLimiter,
  emailOtpResendLimiter,
  publicTrackingLimiter,
  shopifyCallbackLimiter,
  shopifyConnectLimiter,
} from "./middleware/rateLimits.js";
import { authMiddleware, type AuthRequest } from "./middleware/authMiddleware.js";
import { requireRoles } from "./middleware/roleMiddleware.js";
import * as authController from "./controllers/authController.js";
import * as orderController from "./controllers/orderController.js";
import * as resourceController from "./controllers/resourceController.js";
import * as accountController from "./controllers/accountController.js";
import * as productDetailController from "./controllers/productDetailController.js";
import * as shopifyController from "./controllers/shopifyController.js";
import velocityRouter from "./modules/velocity/velocity.routes.js";
import * as debugController from "./controllers/debugController.js";
import * as walletController from "./controllers/walletController.js";
import * as notificationController from "./controllers/notificationController.js";
import * as adminWorkflowController from "./controllers/adminWorkflowController.js";
import * as reportsController from "./controllers/reportsController.js";
import * as invoiceController from "./controllers/invoiceController.js";
import * as labelInvoiceSettingsController from "./controllers/labelInvoiceSettingsController.js";

function parseCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function createApp() {
  const app = express();
  const isProd = process.env.NODE_ENV === "production";
  const corsAllowed = parseCorsOrigins();

  app.set("trust proxy", 1);
  app.use(helmet());
  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "shipamaze-api", uptimeSeconds: Math.floor(process.uptime()) });
  });

  app.use(
    cors({
      origin(origin, callback) {
        if (!isProd && corsAllowed.length === 0) {
          return callback(null, origin || true);
        }
        if (!origin) {
          return callback(null, true);
        }
        if (corsAllowed.includes(origin)) {
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
  app.use(express.json({ limit: "10mb" }));

  const api = express.Router();

  api.post("/auth/register", authRouteLimiter, authController.register);
  api.post("/auth/login", authRouteLimiter, authController.login);
  api.post("/auth/verify-email-otp", emailOtpVerifyLimiter, authController.verifyEmailOtp);
  api.post("/auth/resend-email-otp", emailOtpResendLimiter, authController.resendEmailVerificationOtp);
  api.post("/auth/forgot-password", passwordResetLimiter, authController.forgotPassword);
  api.post("/auth/reset-password", passwordResetLimiter, authController.resetPasswordWithOtp);
  api.get("/auth/me", authMiddleware, authController.me);
  api.get("/auth/profile", authMiddleware, authController.me);
  api.put("/users/profile", authMiddleware, authController.updateProfile);
  api.patch("/auth/profile", authMiddleware, authController.updateProfile);
  api.post("/auth/logout", authController.logout);
  api.post("/auth/change-password", authMiddleware, authController.changePassword);
  api.patch("/auth/change-password", authMiddleware, authController.changePassword);

  api.get("/orders/track/:awb", publicTrackingLimiter, orderController.trackOrderByAwb);
  api.get("/orders/public/:orderId", publicTrackingLimiter, orderController.publicOrderByOrderId);
  api.get(
    "/public/settings/label-invoice",
    publicTrackingLimiter,
    labelInvoiceSettingsController.getPublicLabelInvoiceSettings
  );

  api.get("/orders", authMiddleware, orderController.listOrders);
  api.get("/orders/:orderId", authMiddleware, orderController.getOrderById);
  api.post("/orders", authMiddleware, orderController.createOrder);
  api.post("/orders/bulk", authMiddleware, orderController.createOrdersBulk);
  api.post("/orders/bulk-move", authMiddleware, orderController.bulkMoveOrders);
  api.post("/orders/create-shipment", authMiddleware, orderController.createShipment);
  api.post("/orders/process-selected", authMiddleware, orderController.processSelectedOrders);
  api.post("/orders/:id/junk", authMiddleware, orderController.markOrderJunk);
  api.patch("/orders/:orderId/status", authMiddleware, orderController.updateOrderStatus);
  api.put("/orders/:orderId", authMiddleware, orderController.updateOrder);

  api.get("/settings/label-invoice", authMiddleware, labelInvoiceSettingsController.getLabelInvoiceSettings);
  api.put(
    "/settings/label-invoice",
    authMiddleware,
    requireRoles("admin"),
    labelInvoiceSettingsController.putLabelInvoiceSettings
  );

  api.get("/products/marketplace", authMiddleware, resourceController.listMarketplaceProducts);
  api.get("/products", authMiddleware, resourceController.listProducts);
  api.post("/products", authMiddleware, resourceController.createProduct);
  api.put("/products/:id", authMiddleware, resourceController.updateProduct);
  api.delete("/products/:id", authMiddleware, resourceController.deleteProduct);
  api.get("/products/:id/variants", authMiddleware, productDetailController.getProductVariants);
  api.get("/products/detail/:id", authMiddleware, productDetailController.getProductById);

  api.get("/vendors", authMiddleware, resourceController.listVendors);
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

  api.get(
    "/admin/staff/admins",
    authMiddleware,
    requireRoles("admin"),
    adminWorkflowController.adminListAdminUsers
  );

  api.get("/admin/vendors", authMiddleware, requireRoles("admin"), adminWorkflowController.adminListVendors);
  api.get("/admin/vendors/:id", authMiddleware, requireRoles("admin"), adminWorkflowController.adminGetVendor);
  api.patch("/admin/vendors/:id", authMiddleware, requireRoles("admin"), adminWorkflowController.adminPatchVendor);

  api.get(
    "/admin/dropshippers",
    authMiddleware,
    requireRoles("admin"),
    adminWorkflowController.adminListDropshippers
  );
  api.get(
    "/admin/dropshippers/:id",
    authMiddleware,
    requireRoles("admin"),
    adminWorkflowController.adminGetDropshipper
  );
  api.patch(
    "/admin/dropshippers/:id",
    authMiddleware,
    requireRoles("admin"),
    adminWorkflowController.adminPatchDropshipper
  );

  api.get(
    "/admin/support/tickets",
    authMiddleware,
    requireRoles("admin"),
    adminWorkflowController.adminListSupportTickets
  );
  api.get(
    "/admin/support/tickets/:id",
    authMiddleware,
    requireRoles("admin"),
    adminWorkflowController.adminGetSupportTicket
  );
  api.patch(
    "/admin/support/tickets/:id",
    authMiddleware,
    requireRoles("admin"),
    adminWorkflowController.adminPatchSupportTicket
  );
  api.post(
    "/admin/support/tickets/:id/comments",
    authMiddleware,
    requireRoles("admin"),
    adminWorkflowController.adminAddSupportComment
  );

  api.get("/warehouses", authMiddleware, resourceController.listWarehouses);
  api.post("/warehouses", authMiddleware, resourceController.createWarehouse);
  api.patch("/warehouses/:id", authMiddleware, resourceController.updateWarehouse);
  api.delete("/warehouses/:id", authMiddleware, resourceController.deleteWarehouse);

  api.get("/couriers", authMiddleware, resourceController.listCouriers);
  api.post("/couriers", authMiddleware, resourceController.upsertCourier);

  api.get("/pincodes", authMiddleware, resourceController.listPincodes);
  api.post("/pincodes", authMiddleware, resourceController.upsertPincode);

  api.get("/wallet", authMiddleware, resourceController.getWallet);
  api.post("/wallet/add-balance", authMiddleware, resourceController.addWalletBalance);
  api.post("/wallet/add-funds", authMiddleware, resourceController.addFunds);
  api.post("/wallet/deduct", authMiddleware, walletController.adminDeductWallet);
  api.get("/wallet/transactions", authMiddleware, resourceController.listTransactions);
  api.get("/wallet/cod-remittances", authMiddleware, resourceController.listCodRemittances);

  api.get("/admin/wallets", authMiddleware, walletController.adminListWallets);
  api.patch("/admin/wallets/:userId/adjust", authMiddleware, walletController.adminAdjustWalletHandler);
  api.get("/admin/wallet-transactions", authMiddleware, walletController.adminListWalletTransactions);

  api.get("/invoices", authMiddleware, resourceController.listInvoices);
  api.get("/invoices/:invoiceId/export.csv", authMiddleware, invoiceController.exportInvoiceCsv);
  api.get("/invoices/:invoiceId", authMiddleware, invoiceController.getInvoice);
  api.patch(
    "/invoices/:invoiceId/status",
    authMiddleware,
    requireRoles("admin"),
    invoiceController.patchInvoiceStatus
  );
  api.post(
    "/invoices/:invoiceId/generate",
    authMiddleware,
    requireRoles("admin"),
    invoiceController.postInvoiceGenerateStub
  );

  api.get("/reports/summary", authMiddleware, reportsController.getReportsSummary);
  api.get("/reports/orders", authMiddleware, reportsController.getReportsOrders);
  api.get("/exports/csv", authMiddleware, reportsController.exportCsv);

  api.get("/ndr", authMiddleware, resourceController.listNdr);
  api.patch("/ndr/:awb", authMiddleware, resourceController.updateNdr);

  api.get("/returns", authMiddleware, resourceController.listReturns);
  api.patch("/returns/:returnId", authMiddleware, resourceController.updateReturn);

  api.get("/manifests", authMiddleware, requireRoles("admin"), resourceController.listManifests);

  if (process.env.NODE_ENV === "development") {
    api.get("/debug/my-pickups", authMiddleware, debugController.debugMyPickups);
  }

  api.get("/pickups", authMiddleware, resourceController.listPickups);
  api.post("/pickups", authMiddleware, resourceController.createPickup);

  api.post("/pickup-addresses/repair-dropshipper-ownership", authMiddleware, resourceController.repairDropshipperPickupOwnership);
  api.get("/pickup-addresses", authMiddleware, resourceController.listPickupAddresses);
  api.post("/pickup-addresses", authMiddleware, resourceController.createPickupAddress);
  api.put("/pickup-addresses/:id", authMiddleware, resourceController.updatePickupAddress);
  api.patch("/pickup-addresses/:id", authMiddleware, resourceController.updatePickupAddress);
  api.delete("/pickup-addresses/:id", authMiddleware, resourceController.deletePickupAddress);
  api.patch("/pickup-addresses/:id/default", authMiddleware, resourceController.setDefaultPickupAddress);

  api.get("/weight-disputes", authMiddleware, resourceController.listWeightDisputes);

  api.get("/product-requests", authMiddleware, resourceController.listProductRequests);
  api.post("/product-requests", authMiddleware, resourceController.createProductRequest);
  api.put("/product-requests/:id", authMiddleware, resourceController.updateProductRequest);
  api.delete("/product-requests/:id", authMiddleware, resourceController.deleteProductRequest);

  api.get("/tab-permissions/me", authMiddleware, resourceController.getMyTabPermissions);
  api.get("/tab-permissions/defaults", authMiddleware, resourceController.listTabDefaults);
  api.post("/tab-permissions/defaults", authMiddleware, resourceController.upsertTabDefault);
  api.get("/tab-permissions/user", authMiddleware, resourceController.listUserTabOverrides);
  api.post("/tab-permissions/user", authMiddleware, resourceController.upsertUserTabOverride);
  api.delete("/tab-permissions/user", authMiddleware, resourceController.resetUserTabOverrides);

  api.get("/account/kyc", authMiddleware, accountController.getKyc);
  api.put("/account/kyc", authMiddleware, accountController.putKyc);
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

  // Shopify OAuth — connect redirects browser, callback is hit by Shopify (no Bearer token)
  api.get("/shopify/connect", authMiddleware, shopifyConnectLimiter, shopifyController.initiateConnect);
  api.get("/shopify/callback", shopifyCallbackLimiter, shopifyController.handleCallback);
  api.get("/shopify/status", authMiddleware, shopifyController.getStatus);
  api.post("/shopify/disconnect", authMiddleware, shopifyController.disconnect);
  api.post("/shopify/sync-orders", authMiddleware, shopifyController.syncOrders);
  api.get(
    "/shopify/admin/connections",
    authMiddleware,
    requireRoles("admin"),
    shopifyController.listConnectionsAdmin
  );

  // Velocity Shipping courier integration
  api.use("/velocity", velocityRouter);

  app.use("/api", api);
  app.use(notFoundHandler);
  app.use(errorMiddleware);

  return app;
}
