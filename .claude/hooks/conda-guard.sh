#!/bin/bash
# conda-guard (PreToolUse: Bash)
# All Python tooling runs inside the project's conda env `venv`. This blocks a bare
# python/pip/pytest/uvicorn/celery invocation that doesn't activate venv first, so the
# agent re-runs it as `conda activate venv && <cmd>`. See CLAUDE.md §5 rule 9.
#
# jq-optional: detection runs against the raw stdin payload. Tune ENV_NAME if the env is
# renamed; to disable, remove this hook from settings.json.

ENV_NAME="venv"

INPUT=$(cat)
if command -v jq >/dev/null 2>&1; then
  CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)
fi
[ -z "$CMD" ] && CMD=$(printf '%s' "$INPUT" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)

# Only consider commands that invoke Python tooling (detect on raw payload).
if printf '%s' "$INPUT" | grep -qE '(python3?|pip3?|pytest|uvicorn|celery|alembic)'; then
  # Allow if the env is activated / referenced anywhere in the payload.
  if printf '%s' "$INPUT" | grep -qE "(conda activate ${ENV_NAME}|/${ENV_NAME}/|${ENV_NAME}[/\\]Scripts|${ENV_NAME}[/\\]bin)"; then
    exit 0
  fi
  echo "BLOCKED: run Python tooling inside the conda env '${ENV_NAME}'." >&2
  if [ -n "$CMD" ]; then
    echo "Re-run as:  conda activate ${ENV_NAME} && ${CMD}" >&2
  else
    echo "Prefix the command with:  conda activate ${ENV_NAME} &&" >&2
  fi
  exit 2
fi

exit 0
