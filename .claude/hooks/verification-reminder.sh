#!/bin/bash
# verification-reminder (Stop)
# On finishing a turn, remind that work isn't "done" until the verification gates pass.
# Non-blocking: prints guidance to stderr and exits 0. See .claude/skills/testing-strategy.

echo "Reminder — before declaring work complete, run the verification gates:" >&2
echo "  Frontend:  npx tsc --noEmit && npm run lint && npm test" >&2
echo "  Backend:   conda activate venv && python -m pytest backend_tests -v" >&2
echo "Do not let an agent git-commit; the user tests and commits each sprint." >&2
exit 0
