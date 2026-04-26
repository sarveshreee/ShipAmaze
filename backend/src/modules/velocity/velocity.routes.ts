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
import { requireRoles } from "../../middleware/roleMiddleware.js";
import * as vc from "./velocity.controller.js";

const router = Router();

// ── Public tracking (no auth required) ──────────────────
router.get("/track/public/:awb", vc.trackShipmentPublic);

// ── All remaining routes require a valid session ─────────
router.use(authMiddleware);

// Serviceability – admin, vendor, dropshipper
router.post("/serviceability", vc.serviceability);

// Rates – admin, vendor, dropshipper
router.post("/rates", vc.rates);

// Warehouses – admin, vendor
router.post(
  "/warehouses",
  requireRoles("admin", "vendor"),
  vc.createWarehouse
);

// Forward shipment (full orchestration) – admin, vendor, dropshipper
router.post("/forward/create", vc.createForwardShipment);

// Forward order only – admin, vendor, dropshipper
router.post("/forward/create-order-only", vc.createForwardOrderOnly);

// Assign AWB to existing order – admin, vendor, dropshipper
router.post("/forward/create-shipment", vc.createForwardShipmentLater);

// Reverse / Return (full orchestration) – admin, vendor, dropshipper
router.post("/reverse/create", vc.createReverseShipment);

// Reverse order only – admin, vendor, dropshipper
router.post("/reverse/create-order-only", vc.createReverseOrderOnly);

// Assign AWB to existing reverse order – admin, vendor, dropshipper
router.post("/reverse/create-shipment", vc.createReverseShipmentLater);

// Cancel – admin, vendor, dropshipper
router.post("/cancel", vc.cancelShipment);

// Track – admin, vendor, dropshipper (authenticated)
router.post("/track", vc.trackShipment);

// Admin-only: reports and provider-level lists
router.post("/shipments", requireRoles("admin"), vc.listVelocityShipments);
router.post("/returns", requireRoles("admin"), vc.listVelocityReturns);
router.post("/reports", requireRoles("admin"), vc.getVelocityReports);

export default router;
