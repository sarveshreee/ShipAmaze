# Partner API Authentication

## API key format

```
sk_live_<random-base64url>
```

Keys are stored hashed in MongoDB. Only `keyPrefix` (first 16 characters) is retained for lookup.

## Request header

```
Authorization: Bearer sk_live_xxxxxxxx
```

## Scopes

| Scope | Allows |
|-------|--------|
| `serviceability:read` | POST `/serviceability` |
| `rates:read` | POST `/rates` |
| `shipments:create` | POST `/shipments` |
| `shipments:read` | GET shipment, POST track |
| `shipments:cancel` | POST cancel |

## Key lifecycle (admin)

1. Create partner with `linkedUserId` (dropshipper user for pickup ownership)
2. `POST /api/admin/partners/:id/keys` — returns raw key once
3. `POST /api/admin/partners/:id/keys/:keyId/revoke` — revoke
4. `POST /api/admin/partners/:id/keys/:keyId/revoke` — revoke
5. `GET /api/admin/partners/:id/keys` — prefix/metadata only
6. `PATCH /api/admin/partners/:id/status` — suspend, disable, or activate

## Security rules

- Generic `401` on auth failure (no hint whether key/partner exists)
- Keys hashed with HMAC-SHA256 using server `ENCRYPTION_SECRET` or `JWT_SECRET`
- Never return `keyHash` or raw key on GET
- Failed auth rate limited per IP

## Partner status

| Status | Effect |
|--------|--------|
| ACTIVE | Keys work |
| SUSPENDED | All keys rejected |
| DISABLED | All keys rejected |
