import express, { type Request, type Response } from "express";
import cors from "cors";
import { errorMiddleware } from "./middleware/errorMiddleware.js";
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

export function createApp() {
  const app = express();
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || "http://localhost:8080",
      credentials: true,
    })
  );
  /** Shopify webhooks require raw body for HMAC verification (must be before express.json). */
  app.post(
    "/api/shopify/webhooks",
    express.raw({ type: "application/json" }),
    (req, res, next) => {
      void shopifyController.handleWebhook(req, res).catch(next);
    }
  );
  app.use(express.json({ limit: "10mb" }));

  const api = express.Router();

  api.post("/auth/register", authController.register);
  api.post("/auth/login", authController.login);
  api.post("/auth/forgot-password", authController.forgotPassword);
  api.post("/auth/reset-password", authController.resetPasswordWithOtp);
  api.get("/auth/me", authMiddleware, authController.me);
  api.get("/auth/profile", authMiddleware, authController.me);
  api.put("/users/profile", authMiddleware, authController.updateProfile);
  api.patch("/auth/profile", authMiddleware, authController.updateProfile);
  api.post("/auth/logout", authController.logout);
  api.post("/auth/change-password", authMiddleware, authController.changePassword);
  api.patch("/auth/change-password", authMiddleware, authController.changePassword);

  api.get("/orders/track/:awb", orderController.trackOrderByAwb);
  api.get("/orders/public/:orderId", orderController.publicOrderByOrderId);

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
  api.get("/shopify/connect", authMiddleware, shopifyController.initiateConnect);
  api.get("/shopify/callback", shopifyController.handleCallback);
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
  app.use(errorMiddleware);

  return app;
}
