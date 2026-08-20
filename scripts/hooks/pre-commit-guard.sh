#!/usr/bin/env bash
# PreToolUse hook on Bash.
#
# Blocks two commits that are always a mistake, and only those two. A guard that fires often gets
# bypassed with --no-verify, at which point it protects nothing - so this deliberately does not
# check formatting, message style, or test status.
#
# Claude Code passes the tool call as JSON on stdin. Exit 2 blocks the call and returns stderr to
# the agent; exit 0 lets it through.
set -uo pipefail

PAYLOAD="$(cat)"

# Only interested in git commit. Everything else - including every other git subcommand - passes
# straight through, so this hook is invisible during normal work.
COMMAND="$(printf '%s' "$PAYLOAD" | node -e '
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try { process.stdout.write(JSON.parse(raw)?.tool_input?.command ?? ""); } catch { }
  });
' 2>/dev/null)"

case "$COMMAND" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$REPO_ROOT" || exit 0

if [ "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" = "main" ]; then
  echo "Refusing to commit directly to main. Branch first:" >&2
  echo "  git checkout -b feat/<slug>" >&2
  exit 2
fi

# Staged .env files. .env.example is the deliberate exception - it holds names, never values.
SECRETS="$(git diff --cached --name-only | grep -E '(^|/)\.env' | grep -v '\.env\.example$' || true)"
if [ -n "$SECRETS" ]; then
  echo "Refusing to commit environment files - these hold real keys:" >&2
  echo "$SECRETS" | sed 's/^/  /' >&2
  echo "Unstage with: git restore --staged <file>" >&2
  exit 2
fi

exit 0
