/**
 * Velocity Shipping – Express Router.
 * Mount this at /api/velocity in app.ts.
 *
 * Role access:
 *   admin      → all routes
 *   vendor     → warehouses, serviceability, rates, forward shipments, tracking, returns
 *   dropshipper → serviceability, rates, forward shipments, tracking, returns
 */

import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware.js";
import { publicTrackingLimiter } from "../../middleware/rateLimits.js";
import { requireRoles } from "../../middleware/roleMiddleware.js";
import { requireFullDropshipper } from "../../middleware/dropshipperAccessMiddleware.js";
import * as vc from "./velocity.controller.js";

const router = Router();

// ── Public tracking (no auth required) ──────────────────
router.get("/track/public/:awb", publicTrackingLimiter, vc.trackShipmentPublic);

// ── All remaining routes require a valid session ─────────
router.use(authMiddleware);

// Serviceability – admin, vendor, dropshipper
router.post("/serviceability", vc.serviceability);

// Rates – admin, vendor, dropshipper
router.post("/rates", vc.rates);

// Warehouses – admin, vendor (Warehouse), dropshipper (Pickup link)
router.post(
  "/warehouses",
  requireRoles("admin", "vendor", "dropshipper"),
  vc.createWarehouse
);

// Warehouse sync – auto-create in Velocity from local Pickup / vendor Warehouse doc
router.post(
  "/warehouses/sync",
  requireRoles("admin", "vendor", "dropshipper"),
  vc.syncWarehouse
);

// Forward shipment (full orchestration) – admin, vendor, dropshipper (full access)
router.post("/forward/create", requireFullDropshipper, vc.createForwardShipment);

// Forward order only – admin, vendor, dropshipper (full access)
router.post("/forward/create-order-only", requireFullDropshipper, vc.createForwardOrderOnly);

// Assign AWB to existing order – admin, vendor, dropshipper (full access)
router.post("/forward/create-shipment", requireFullDropshipper, vc.createForwardShipmentLater);

// Reverse / Return (full orchestration) – admin, vendor, dropshipper (full access)
router.post("/reverse/create", requireFullDropshipper, vc.createReverseShipment);

// Reverse order only – admin, vendor, dropshipper (full access)
router.post("/reverse/create-order-only", requireFullDropshipper, vc.createReverseOrderOnly);

// Assign AWB to existing reverse order – admin, vendor, dropshipper (full access)
router.post("/reverse/create-shipment", requireFullDropshipper, vc.createReverseShipmentLater);

// Cancel – admin, vendor, dropshipper (full access)
router.post("/cancel", requireFullDropshipper, vc.cancelShipment);

// Track – admin, vendor, dropshipper (authenticated, full access)
router.post("/track", requireFullDropshipper, vc.trackShipment);

// Admin-only: reports and provider-level lists
router.post("/shipments", requireRoles("admin"), vc.listVelocityShipments);
router.post("/returns", requireRoles("admin"), vc.listVelocityReturns);
router.post("/reports", requireRoles("admin"), vc.getVelocityReports);

// Admin-only: bulk status refresh from Velocity
router.post("/sync-statuses", requireRoles("admin"), vc.syncShipmentStatuses);

// Label PDF proxy – admin, vendor, dropshipper (authenticated)
// Fetches the Velocity-provided label PDF via backend, handles expired presigned URLs
router.get("/label-pdf/:orderId", vc.getLabelPdf);

export default router;
