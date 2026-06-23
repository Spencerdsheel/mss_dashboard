---
name: backend-components-checklist
description: Use as a production-readiness checklist when building or reviewing backend features in this dashboard — scalability/indexing, the full security surface (PII, retention, secrets, input validation, dependency scanning), performance/caching, monitoring/audit trails, recovery/rollback/circuit-breakers/concurrency, and testing depth. Source: knowledge_base/Backend Components.md.
---

# Backend Components — Production Checklist

Run a feature against these before calling it done. (A breadth checklist; depth lives in the
`backend-philosophy`, `security-patterns`, `data-pipeline`, and `infrastructure` skills.)

## Database & scalability
- [ ] Handles target load (≈1000 users); queries optimized; **proper indexing**.
- [ ] Behaves the same as data grows 100 → 100k rows (no design that only works small).

## Security
- [ ] Passwords stored securely (PBKDF2); HTTPS/TLS + cert rotation.
- [ ] AuthN/AuthZ, roles & permissions; **multi-tenancy & data isolation**.
- [ ] PII handling, retention/deletion policy; session mgmt & token expiry; GDPR/HIPAA where applicable.
- [ ] API keys protected; **secrets management** (AES-256-GCM); input validation + injection prevention.
- [ ] Rate limiting / abuse prevention; dependency scanning & patching; resistant to bots/scrapers.

## Performance
- [ ] Fast page load; optimized API; cache frequently-accessed data + **invalidation strategy**.
- [ ] Plan for traffic spikes; defined RTO/RPO; accessibility.

## Monitoring & logs
- [ ] Meaningful logging; **audit trails** (tamper-evident); error tracking; perf monitoring.

## Recovery
- [ ] Roll back a bad deployment; disaster-recovery plan; circuit breakers / fallback behavior.
- [ ] Concurrency handling & race-condition prevention; **retry w/ backoff + idempotency**.

## Testing
- [ ] Unit + integration + E2E; regression; load/stress; resilience; coverage thresholds in CI;
      code review.

**Full detail:** `knowledge_base/Backend Components.md`.
