# Rule: API Boundary & Secrets

The boundary between the outside world and the system assumes hostility. Inputs are validated;
secrets never leak.

## Must

- Validate and type every inbound payload at the edge (Pydantic models / explicit parsing).
- Tokens live in **httpOnly cookies**. CORS, correlation-ID, and rate-limiting middleware stay
  in front of handlers (`services/api/middleware.py`, `rate_limiter.py`).
- Encrypt provider secrets at rest with AES-256-GCM via `services/common/secrets.py`.
  `SECRET_ENCRYPTION_KEY` is distinct from `JWT_SECRET`.
- Errors return a safe, structured shape (`error_handler.py`) — no stack traces or secrets to
  the client.

## Must not

- Never log, commit, or return secrets, tokens, passwords, or live credentials.
- Never put a JWT or secret in a URL, query string, or `localStorage`.
- Never echo a decrypted provider secret back through an API response.

## Verify

Search a diff for `print(`/`logger.*(` lines that include token/password/secret/email values.
Secrets in responses → fail.
