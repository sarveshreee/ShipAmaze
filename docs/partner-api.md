# ShipAmaze Partner Courier API

External websites integrate with ShipAmaze using API keys to access courier serviceability, rates, booking, tracking, and cancellation.

**Base URL:** `https://your-shipamaze-host/api/partner/v1`

## Authentication

```
Authorization: Bearer sk_live_<secret>
```

API keys are issued by ShipAmaze admin. The full secret is shown **once** at creation. Store it securely.

See [partner-api-authentication.md](./partner-api-authentication.md).

## Endpoints

| Method | Path | Scope |
|--------|------|-------|
| GET | `/health` | Public |
| POST | `/serviceability` | `serviceability:read` |
| POST | `/rates` | `rates:read` |
| POST | `/shipments` | `shipments:create` + `Idempotency-Key` |
| GET | `/shipments/:referenceId` | `shipments:read` |
| POST | `/shipments/:referenceId/track` | `shipments:read` |
| POST | `/shipments/:referenceId/cancel` | `shipments:cancel` |

See [partner-api-endpoints.md](./partner-api-endpoints.md).

## Providers

Partners select `velocity`, `lorrigo`, or `ekart`. ShipAmaze handles provider credentials internally.

## Security

- Never log or expose API keys
- Tenant isolation by `partnerId`
- Sanitized provider errors only
- Per-partner rate limits

## Phase 1 limitations

- ~~No wallet billing~~ — see Billing below when `PARTNER_WALLET_BILLING_ENABLED=true`
- No outbound webhooks
- No partner pickup creation API (use existing ShipAmaze pickup addresses)
- No label download endpoint yet

## Billing (`PARTNER_WALLET_BILLING_ENABLED`)

When enabled (`true`):

- Partner uses the **existing dropshipper wallet** at `Partner.linkedUserId` (not a separate partner wallet).
- **Lorrigo / Ekart:** balance precheck before provider call; debit after successful booking (AWB persisted).
- **Velocity:** uses the existing Velocity wallet flow only — no duplicate partner-level debit.
- Insufficient balance → `402` / `INSUFFICIENT_BALANCE` (no provider call).
- Failed or uncertain bookings are **not** charged until booking is confirmed.
- Cancellation does **not** automatically refund the wallet in this phase.

When disabled (`false`, default): Phase 1 behavior — no partner wallet precheck/debit for Lorrigo/Ekart.

Partner creation with billing enabled requires `linkedUserId` to be a **dropshipper** user.

## Related docs

- [Authentication](./partner-api-authentication.md)
- [Endpoints](./partner-api-endpoints.md)
- [Errors](./partner-api-errors.md)
- [Idempotency](./partner-api-idempotency.md)
- [Operational runbook](./partner-api-runbook.md)

## Production configuration

Explicitly set in production:

- `PARTNER_API_ENABLED=true`
- `PARTNER_WALLET_BILLING_ENABLED=true` (when billing partner Lorrigo/Ekart shipments)
- `EKART_CANCEL_ENABLED=true` (only if partners need Ekart cancellation)

Partner `linkedUserId` must be a **dropshipper** when wallet billing is enabled.
