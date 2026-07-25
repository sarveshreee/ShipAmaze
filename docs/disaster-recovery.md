# Disaster Recovery Checklist

## RTO / RPO targets (suggested)

| Tier | RPO | RTO |
|------|-----|-----|
| MongoDB (Atlas) | ≤ 1 hour (snapshot) | ≤ 4 hours |
| API / Frontend (Render) | n/a (stateless) | ≤ 30 minutes |
| Provider outage | n/a | Degrade: disable provider flag |

## MongoDB

- [ ] Confirm Atlas continuous backup / snapshots enabled
- [ ] Document restore procedure for primary cluster
- [ ] After restore: re-run health, verify `Order` / `NDR` / `Pickup` counts
- [ ] Reconcile in-flight bookings (`bookingReconciliationRequired: true`)

## Application

- [ ] Redeploy last good API + frontend
- [ ] Validate secrets: JWT, ENCRYPTION, provider creds, Shopify, Cloudinary
- [ ] Confirm CORS / `FRONTEND_URL` / `SHOPIFY_REDIRECT_URI`
- [ ] Warm sync: watch first `[velocity:startup-sync]` / `[lorrigo:startup-sync]`

## Provider outages

| Provider | Mitigation |
|----------|------------|
| Velocity down | Pause Process Selected Velocity path; support backlog; keep Lorrigo if healthy |
| Lorrigo down | `LORRIGO_ENABLED=false`; discovery `velocity` |
| Both down | Manual booking offline; queue orders as `pending` |

## Secrets compromise

- [ ] Rotate JWT + ENCRYPTION secrets (forces re-login)
- [ ] Rotate Velocity + Lorrigo passwords/API keys
- [ ] Rotate Shopify app secrets if exposed
- [ ] Invalidate sessions / review `LoginSession`

## Communication template

1. Status page / internal Slack: impact + ETA  
2. Disable risky provider via flag  
3. Fix / restore  
4. Smoke tests (booking, track, NDR)  
5. Postmortem within 48h  

## Post-incident

- [ ] Capture `correlationId` samples
- [ ] Export metrics (booking, NDR, discovery failures)
- [ ] File follow-ups from [phase8-production-audit.md](./phase8-production-audit.md)
