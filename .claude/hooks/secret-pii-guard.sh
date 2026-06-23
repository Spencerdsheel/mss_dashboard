#!/bin/bash
# secret-pii-guard (PreToolUse: Edit | Write | MultiEdit)
# Flags edits that (a) log/print secrets, tokens, or passwords, or (b) derive tenant_id
# from request input (query/body/params/headers) — both are red-line violations.
# See CLAUDE.md §5 (rules 1, 5) and .claude/rules/{tenant-isolation,api-boundary}.md.
#
# jq-optional: detection runs against the raw stdin payload (new content + edit strings
# are all present in it). Conservative; if it false-positives the user can remove this
# hook from settings.json.

INPUT=$(cat)
violation=""

# (a) Logging/printing a secret/token/password value.
if printf '%s' "$INPUT" | grep -qiE '(log(ger)?\.(debug|info|warning|error)|print|console\.(log|error|info|warn)).{0,40}(password|secret|token|jwt|api[_-]?key|credential)'; then
  violation="logs or prints a secret/token/password value"
fi

# (b) tenant_id sourced from request input.
if printf '%s' "$INPUT" | grep -qiE 'tenant_?id.{0,40}(request\.(query|body|args|json|headers|path_params)|query_params|\.headers\[|req\.(query|body|params|headers)|searchParams|params\.tenant)'; then
  violation="${violation:+$violation; }derives tenant_id from request input (must come from verified JWT claims)"
fi

if [ -n "$violation" ]; then
  echo "BLOCKED: this change appears to violate a red line — it $violation." >&2
  echo "See .claude/rules/tenant-isolation.md and .claude/rules/api-boundary.md." >&2
  echo "If this is a false positive, the user can disable .claude/hooks/secret-pii-guard.sh." >&2
  exit 2
fi

exit 0
