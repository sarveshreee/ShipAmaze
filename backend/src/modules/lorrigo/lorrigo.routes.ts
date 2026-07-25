/**
 * Lorrigo routes — Phase 2 status/health + Phase 3 pickup sync retry.
 * Mount at /api/lorrigo.
 */

import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware.js";
import { requireRoles } from "../../middleware/roleMiddleware.js";
import * as lc from "./lorrigo.controller.js";

const router = Router();

router.use(authMiddleware);

router.get("/status", requireRoles("admin"), lc.getLorrigoStatus);
router.get("/health", requireRoles("admin"), lc.getLorrigoHealth);

/** Retry provider sync for an existing local pickup (admin / vendor / dropshipper owner). */
router.post(
  "/pickups/:id/sync",
  requireRoles("admin", "vendor", "dropshipper"),
  lc.retryPickupSync
);

export default router;
