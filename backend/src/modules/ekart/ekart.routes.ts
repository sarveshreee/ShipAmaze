/**
 * Ekart routes — health (admin) + Critical Updates webhook (optional public).
 */

import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware.js";
import { requireRoles } from "../../middleware/roleMiddleware.js";
import * as ec from "./ekart.controller.js";

const router = Router();

/** Durin Critical Updates — enroll this HTTPS path with Ekart (no JWT). */
router.post("/webhooks/critical-updates", ec.postEkartCriticalUpdates);

router.use(authMiddleware);
router.get("/health", requireRoles("admin"), ec.getEkartHealth);
router.post(
  "/pickups/:id/sync",
  requireRoles("admin", "vendor", "dropshipper"),
  ec.syncPickupLocation
);
router.post(
  "/pickups/:id/unlink",
  requireRoles("admin", "vendor", "dropshipper"),
  ec.unlinkPickupLocation
);

export default router;
