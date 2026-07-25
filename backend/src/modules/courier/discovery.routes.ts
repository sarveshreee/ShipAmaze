/**
 * Multi-provider courier discovery routes.
 * Mount at /api/courier (singular) to avoid colliding with /api/couriers resource CRUD.
 */

import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware.js";
import { requireRoles } from "../../middleware/roleMiddleware.js";
import * as dc from "./discovery.controller.js";

const router = Router();

router.use(authMiddleware);

router.post(
  "/serviceability",
  requireRoles("admin", "vendor", "dropshipper"),
  dc.serviceability
);
router.post("/rates", requireRoles("admin", "vendor", "dropshipper"), dc.rates);
router.get("/discovery-metrics", requireRoles("admin"), dc.discoveryMetrics);

export default router;
