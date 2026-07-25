/**
 * Lorrigo routes — Phase 2: status / health only.
 * Mount at /api/lorrigo.
 */

import { Router } from "express";
import { authMiddleware } from "../../middleware/authMiddleware.js";
import { requireRoles } from "../../middleware/roleMiddleware.js";
import * as lc from "./lorrigo.controller.js";

const router = Router();

router.use(authMiddleware);
router.use(requireRoles("admin"));

router.get("/status", lc.getLorrigoStatus);
router.get("/health", lc.getLorrigoHealth);

export default router;
