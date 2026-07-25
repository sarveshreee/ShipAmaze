/**
 * Multi-provider courier discovery + booking routes.
 * Mount at /api/courier (singular) to avoid colliding with /api/couriers resource CRUD.
 */

import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware.js";
import { requireRoles } from "../../middleware/roleMiddleware.js";
import { courierBookingLimiter } from "../../middleware/rateLimits.js";
import * as dc from "./discovery.controller.js";
import * as bc from "./booking.controller.js";

const router = Router();

router.use(authMiddleware);

router.get("/providers", requireRoles("admin", "vendor", "dropshipper"), bc.listProviders);
router.post(
  "/serviceability",
  requireRoles("admin", "vendor", "dropshipper"),
  dc.serviceability
);
router.post("/rates", requireRoles("admin", "vendor", "dropshipper"), dc.rates);
router.get("/discovery-metrics", requireRoles("admin"), dc.discoveryMetrics);
router.get("/booking-metrics", requireRoles("admin"), bc.bookingMetrics);
router.get("/ndr-metrics", requireRoles("admin"), bc.ndrMetrics);
router.post("/sync-ndr", requireRoles("admin", "vendor", "dropshipper"), bc.syncNdr);
router.post(
  "/shipments",
  courierBookingLimiter,
  requireRoles("admin", "vendor", "dropshipper"),
  bc.createShipment
);
router.post("/shipments/cancel", requireRoles("admin", "vendor", "dropshipper"), bc.cancelShipment);

export default router;
