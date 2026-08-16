# Partner API Errors

## Format

```json
{
  "success": false,
  "error": {
    "code": "BOOKING_FAILED",
    "message": "Shipment could not be booked",
    "retryable": false
  },
  "requestId": "...",
  "correlationId": "..."
}
```

## Common codes

| Code | HTTP | retryable | Meaning |
|------|------|-----------|---------|
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | false | Missing `Idempotency-Key` on booking |
| `IDEMPOTENCY_CONFLICT` | 409 | false | Same key, different body |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | true | Duplicate in-flight request |
| `BOOKING_FAILED` | 4xx/5xx | varies | Provider booking failed |
| `BOOKING_UNCERTAIN` | 504 | false | Timeout — poll GET shipment, do not blind retry |
| `RATE_LIMITED` | 429 | true | Too many requests |
| `BOOKING_RATE_LIMITED` | 429 | true | Too many bookings |
| `INSUFFICIENT_BALANCE` | 402 | false | Wallet precheck failed (billing enabled) |
| `FORBIDDEN` | 403 | false | Pickup not accessible or provider not allowed |
| `VALIDATION_FAILED` | 400 | false | Request body validation failed |
| `DUPLICATE_FIELD` | 400 | false | Mongo unique constraint (e.g. duplicate reference) |
| `PROVIDER_ERROR` | 4xx/5xx | varies | Sanitized courier provider error |
| `REQUEST_FAILED` | varies | varies | Generic partner API failure |
| `UNAUTHORIZED` | 401 | false | Invalid or missing API key |
| `NOT_FOUND` | 404 | false | Shipment not found for this partner |

## Idempotency-related errors

After a **clear booking failure**, if Phase 4 reference lifecycle released `partnerReferenceId`, you may retry with the **same** `Idempotency-Key` and same body.

For **`BOOKING_UNCERTAIN`**, retry with the **same** key and body to recover the existing order — do not create a new idempotency key.

`COMPLETED` responses are replayed from cache for 24 hours.

Provider errors are sanitized — raw courier API bodies are never returned.
