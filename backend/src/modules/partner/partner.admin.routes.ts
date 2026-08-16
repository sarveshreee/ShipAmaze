import { Router } from "express";
import * as pac from "./partner.admin.controller.js";

const router = Router();

router.post("/", pac.adminCreatePartner);
router.get("/", pac.adminListPartners);
router.patch("/:id/status", pac.adminUpdatePartnerStatus);
router.post("/:id/keys", pac.adminCreatePartnerKey);
router.get("/:id/keys", pac.adminListPartnerKeys);
router.post("/:id/keys/:keyId/revoke", pac.adminRevokePartnerKey);

export default router;
