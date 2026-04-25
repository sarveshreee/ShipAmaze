import express, { type Request, type Response } from "express";
import cors from "cors";
import { errorMiddleware } from "./middleware/errorMiddleware.js";
import { authMiddleware, type AuthRequest } from "./middleware/authMiddleware.js";
import * as authController from "./controllers/authController.js";
import * as orderController from "./controllers/orderController.js";
import * as resourceController from "./controllers/resourceController.js";
import * as accountController from "./controllers/accountController.js";
import * as productDetailController from "./controllers/productDetailController.js";
import * as shopifyController from "./controllers/shopifyController.js";

export function createApp() {
  const app = express();
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || "http://localhost:8080",
      credentials: true,
    })
  );
  app.use(express.json({ limit: "10mb" }));

  const api = express.Router();

  api.post("/auth/register", authController.register);
  api.post("/auth/login", authController.login);
  api.get("/auth/me", authMiddleware, authController.me);
  api.post("/auth/logout", authMiddleware, authController.logout);
  api.post("/auth/change-password", authMiddleware, authController.changePassword);

  api.get("/orders/track/:awb", orderController.trackOrderByAwb);
  api.get("/orders/public/:orderId", orderController.publicOrderByOrderId);

  api.get("/orders", authMiddleware, orderController.listOrders);
  api.post("/orders", authMiddleware, orderController.createOrder);
  api.post("/orders/bulk", authMiddleware, orderController.createOrdersBulk);
  api.patch("/orders/:orderId/status", authMiddleware, orderController.updateOrderStatus);

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
  api.get("/wallet/transactions", authMiddleware, resourceController.listTransactions);
  api.get("/wallet/cod-remittances", authMiddleware, resourceController.listCodRemittances);

  api.get("/invoices", authMiddleware, resourceController.listInvoices);

  api.get("/ndr", authMiddleware, resourceController.listNdr);
  api.patch("/ndr/:awb", authMiddleware, resourceController.updateNdr);

  api.get("/returns", authMiddleware, resourceController.listReturns);
  api.patch("/returns/:returnId", authMiddleware, resourceController.updateReturn);

  api.get("/manifests", authMiddleware, resourceController.listManifests);

  api.get("/pickups", authMiddleware, resourceController.listPickups);
  api.post("/pickups", authMiddleware, resourceController.createPickup);

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

  app.use("/api", api);
  app.use(errorMiddleware);

  return app;
}
