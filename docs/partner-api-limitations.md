# Partner API — Known Limitations (Phase 5D / Future)

Items reviewed in Phase 5C. No production correctness blocker identified unless noted.

| Area | Status | Notes |
|------|--------|--------|
| Per-partner `Partner.rateLimit` | Not implemented | Env defaults apply to all partners. Phase 5D. |
| Ekart cancel flag / semantics | Dashboard + partner cancel exist | Verify product-specific cancel rules per provider docs. |
| Cancel wallet refund | Not automatic | Cancel does not auto-credit wallet; manual/admin adjustment if needed. |
| Label download API | Not exposed on Partner API | Use dashboard or provider tools. |
| Outbound webhooks | Not implemented | Partners poll `GET /shipments/:referenceId` and track endpoints. |
| Partner pickup list API | Not implemented | Pickups configured in dashboard; `pickupAddressId` required on create. |
| NDR / RTO / reverse APIs | Not on Partner API | Available in dashboard/provider sync paths. |
| Partner audit log TTL | Not configured | See runbook — retention policy required before TTL/archival. |
| `PARTNER_API_ENABLED` default | `true` | Use kill switch intentionally; document in production checklist. |

## Velocity wallet (Partner)

Partner Velocity bookings use the internal `bookForwardShipmentForOrder` path (not `PARTNER_WALLET_BILLING_ENABLED`). Wallet debit occurs at booking time inside that flow. Velocity status sync only polls orders that already have an AWB; it does not assign AWB to unbooked orders. **No additional status-sync wallet hook is required** for Partner Velocity (see `docs/partner-api-runbook.md`).
