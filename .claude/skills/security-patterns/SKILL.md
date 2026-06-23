---
name: security-patterns
description: Use when implementing or reviewing auth/security in this dashboard — JWT lifecycle + httpOnly cookies + Redis revocation, password reset, RBAC + project-level authz, PBKDF2 password hashing, AES-256-GCM secret encryption + key management, security headers, CORS, rate limiting, input validation, SQL-injection/XSS prevention, and audit logging. Source: knowledge_base/07_SECURITY_PATTERNS.md.
---

# Security Patterns

## Authentication
- **JWT (HS256)** claims: `sub`, `tenant_id`, `role`, `project_ids`; expiring; stored in
  **httpOnly cookies** with Secure + SameSite. Never `localStorage`/`sessionStorage`.
- Lifecycle: validate creds → mint JWT → set cookie → validate per request → **Redis blacklist**
  for logout/revocation (JWTs are stateless).
- Password reset tokens: single-use, time-limited, invalidated immediately after use.

## Authorization (RBAC)
- Roles `ADMIN` (all) / `CLIENT` (assigned projects only); role in JWT claims.
- **Enforce at the data layer, not the UI.** UI may hide; the API must enforce. Authorization is
  a **filter** (filter by accessible `project_ids`), not just a gate. Admin bypasses project
  restrictions after a role check. See `.claude/skills/rbac-model` + `.claude/rules/tenant-isolation.md`.

## Encryption
- **Passwords: PBKDF2-SHA256, 120k iterations**, unique salt, timing-safe compare, min length.
- **Secrets: AES-256-GCM** at rest, unique nonce, key from env (`SECRET_ENCRYPTION_KEY` ≠
  `JWT_SECRET`). No keys in code/config; plan for rotation (rotation ⇒ re-encrypt). Never roll
  your own crypto.

## Network & input
- Security headers (HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff, CSP,
  Referrer-Policy) in Nginx. CORS: explicit origins, no wildcards, credentials for authed requests.
- Rate limits: auth 10/min, admin 5/hr, global 100/min (Redis-backed).
- **Validate every body with Pydantic** (422 on invalid). **Parameterized asyncpg queries only**
  — never string-format SQL. React auto-escapes; avoid `dangerouslySetInnerHTML`.

## Audit & sensitive data
Log login/logout, admin actions, refreshes, failed auths. **Never log passwords, tokens, or
secrets; minimize/redact PII.** See `.claude/rules/api-boundary.md`.

**Full detail:** `knowledge_base/07_SECURITY_PATTERNS.md`.
