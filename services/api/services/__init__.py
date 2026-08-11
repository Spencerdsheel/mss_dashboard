"""Sprint 14 — domain/service functions callable from thin REST handlers.

Anything that talks to a third-party SDK (e.g. `anthropic`) lives in this
package, never in `services/api/routes/*` (service-boundary discipline —
see `.claude/rules/service-boundary.md`).
"""
