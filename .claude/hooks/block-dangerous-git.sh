#!/bin/bash
# git-guardrail (PreToolUse: Bash)
# Hard guardrail: agents must NEVER stage, commit, push, or destructively rewrite git
# state. The USER tests and commits after each sprint. See CLAUDE.md §5 rule 8.
#
# jq-optional: detection runs against the raw stdin payload so it works on Git-Bash
# without jq; extraction is best-effort for display only.

INPUT=$(cat)
# Best-effort command extraction for the message (jq if present, else sed, else generic).
if command -v jq >/dev/null 2>&1; then
  CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
fi
[ -z "$CMD" ] && CMD=$(printf '%s' "$INPUT" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)
[ -z "$CMD" ] && CMD="the requested git command"

DANGEROUS_PATTERNS=(
  "git add"
  "git commit"
  "git push"
  "push --force"
  "git reset --hard"
  "reset --hard"
  "git clean -f"
  "git clean -fd"
  "git branch -D"
  "git checkout \."
  "git restore \."
  "git stash drop"
  "git stash clear"
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if printf '%s' "$INPUT" | grep -qE "$pattern"; then
    echo "BLOCKED: '$CMD' matches '$pattern'. Agents do not commit in this repo —" >&2
    echo "the user stages, commits, and pushes manually after testing each sprint." >&2
    exit 2
  fi
done

exit 0
