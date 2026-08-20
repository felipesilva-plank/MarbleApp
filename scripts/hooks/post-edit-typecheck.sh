#!/usr/bin/env bash
# PostToolUse hook: typecheck the workspace an edited file belongs to.
#
# Runs after every Edit/Write. Scoped to one workspace because typechecking both takes ~6s and a
# hook that slow gets disabled within a day. Non-blocking by design: it prints and exits 0, so a
# transient error mid-refactor does not stop the agent - it just makes sure the agent SEES the
# error immediately rather than twenty edits later.
set -uo pipefail

FILE="${CLAUDE_FILE_PATH:-}"
[ -z "$FILE" ] && exit 0

case "$FILE" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
REL="${FILE#"$REPO_ROOT"/}"

case "$REL" in
  apps/web/*)      WORKSPACE="@marble/web" ;;
  packages/core/*) WORKSPACE="@marble/core" ;;
  *) exit 0 ;;
esac

OUTPUT="$(cd "$REPO_ROOT" && npm run --silent typecheck --workspace "$WORKSPACE" 2>&1)" && exit 0

echo "typecheck failed in $WORKSPACE after editing $REL:"
echo "$OUTPUT" | grep -E '(error TS|\.tsx?\()' | head -10
exit 0
