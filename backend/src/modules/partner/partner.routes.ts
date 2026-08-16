import { Router } from "express";
import {
  partnerAuthMiddleware,
  requirePartnerScope,
} from "./partnerAuthMiddleware.js";
import { PARTNER_SCOPES } from "./partnerScopes.js";
import {
  partnerAuthFailureLimiter,
  partnerBookingLimiter,
  partnerGeneralLimiter,
} from "./partnerRateLimits.js";
import * as pc from "./partner.controller.js";
import { isPartnerApiEnabled } from "./partnerConfig.js";
import { AppError } from "../../middleware/errorMiddleware.js";
import { partnerErrorHandler } from "./partnerErrorHandler.js";

const router = Router();

router.use((req, _res, next) => {
  if (!isPartnerApiEnabled()) {
    return next(new AppError(503, "Partner API is disabled"));
  }
  next();
});

router.get("/health", pc.health);

router.use(partnerAuthFailureLimiter);
router.use(partnerAuthMiddleware);
router.use(partnerGeneralLimiter);

router.post(
  "/serviceability",
  requirePartnerScope(PARTNER_SCOPES.SERVICEABILITY_READ),
  pc.serviceability
);

router.post(
  "/rates",
  requirePartnerScope(PARTNER_SCOPES.RATES_READ),
  pc.rates
);

router.post(
  "/shipments",
  partnerBookingLimiter,
  requirePartnerScope(PARTNER_SCOPES.SHIPMENTS_CREATE),
  pc.createShipment
);

router.get(
  "/shipments/:referenceId",
  requirePartnerScope(PARTNER_SCOPES.SHIPMENTS_READ),
  pc.getShipment
);

router.post(
  "/shipments/:referenceId/track",
  requirePartnerScope(PARTNER_SCOPES.SHIPMENTS_READ),
  pc.trackShipment
);

router.post(
  "/shipments/:referenceId/cancel",
  requirePartnerScope(PARTNER_SCOPES.SHIPMENTS_CANCEL),
  pc.cancelShipment
);

router.use(partnerErrorHandler);

export default router;
