/**
 * Ekart routes — health only (booking goes through /api/courier).
 */

import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware.js";
import { requireRoles } from "../../middleware/roleMiddleware.js";
import * as ec from "./ekart.controller.js";

const router = Router();

router.use(authMiddleware);
router.get("/health", requireRoles("admin"), ec.getEkartHealth);

export default router;
