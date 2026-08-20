#!/usr/bin/env bash
# Worktree helper. Each parallel agent needs its own working directory, and the ceremony of
# `git worktree add` + `npm install` + remembering where things are is exactly the friction that
# stops people running four agents at once.
#
#   ./scripts/wt.sh new <slug> [prefix]   create ../marble-<slug> on <prefix>/<slug>, deps linked
#   ./scripts/wt.sh ls                    list worktrees with their branch and dirty state
#   ./scripts/wt.sh rm <slug>             remove the worktree (refuses if dirty)
#   ./scripts/wt.sh clean                 prune stale entries and report merged branches
#
# Set WT_BASE to branch from something other than the trunk - that is how you put a stacked PR's
# child in its own worktree:  WT_BASE=feat/preset-storage ./scripts/wt.sh new preset-ui
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
PARENT="$(dirname "$REPO_ROOT")"
TRUNK="$(git symbolic-ref --quiet refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')"
TRUNK="${TRUNK:-main}"

die() { echo "wt: $*" >&2; exit 1; }

cmd_new() {
  local slug="${1:-}" prefix="${2:-feat}"
  [ -z "$slug" ] && die "usage: wt.sh new <slug> [prefix]"

  local branch="$prefix/$slug"
  local path="$PARENT/marble-$slug"
  local base="${WT_BASE:-origin/$TRUNK}"

  [ -e "$path" ] && die "$path already exists"

  # Branch from the trunk by default, not from whatever HEAD happens to be. Parallel features
  # should be independent; inheriting an unrelated in-flight branch is how two of them end up
  # entangled. WT_BASE overrides this for the one case where you do want it - a stacked child.
  git -C "$REPO_ROOT" fetch --quiet origin "$TRUNK" || true
  git -C "$REPO_ROOT" worktree add -b "$branch" "$path" "$base"

  # npm workspaces hoist everything to the root, so a fresh worktree has no node_modules at all.
  # Symlinking the primary checkout's is ~200x faster than installing and correct as long as
  # package.json has not changed - which the guard below checks.
  if [ -d "$REPO_ROOT/node_modules" ] && \
     diff -q "$REPO_ROOT/package-lock.json" "$path/package-lock.json" >/dev/null 2>&1; then
    ln -s "$REPO_ROOT/node_modules" "$path/node_modules"
    echo "wt: linked node_modules from the primary checkout"
  else
    echo "wt: lockfile differs from the primary checkout - run 'npm install' in $path"
  fi

  # .env.local is gitignored, so a new worktree has none and the app misbehaves in ways that look
  # like a code problem.
  [ -f "$REPO_ROOT/.env.local" ] && cp "$REPO_ROOT/.env.local" "$path/.env.local" && echo "wt: copied .env.local"

  echo
  echo "  $branch"
  echo "  cd $path && claude"
}

cmd_ls() {
  git -C "$REPO_ROOT" worktree list --porcelain | awk '
    /^worktree /  { path = substr($0, 10) }
    /^branch /    { branch = substr($0, 8); sub("refs/heads/", "", branch) }
    /^detached/   { branch = "(detached)" }
    /^$/          { if (path) { printf "%-40s %s\n", path, branch; path=""; branch="" } }
    END           { if (path) printf "%-40s %s\n", path, branch }
  ' | while read -r path branch; do
    dirty=""
    if [ -d "$path" ] && [ -n "$(git -C "$path" status --porcelain 2>/dev/null)" ]; then
      dirty="  *dirty"
    fi
    printf '%s%s\n' "$(printf '%-40s %s' "$path" "$branch")" "$dirty"
  done
}

cmd_rm() {
  local slug="${1:-}"
  [ -z "$slug" ] && die "usage: wt.sh rm <slug>"
  local path="$PARENT/marble-$slug"
  [ -d "$path" ] || die "no worktree at $path"

  # Drop the symlink before checking: it is our own artefact, and leaving it in place makes every
  # worktree read as dirty. `git worktree remove` would refuse over it anyway.
  [ -L "$path/node_modules" ] && rm "$path/node_modules"

  if [ -n "$(git -C "$path" status --porcelain)" ]; then
    die "$path has uncommitted changes. Commit them, or remove it yourself with --force."
  fi

  git -C "$REPO_ROOT" worktree remove "$path"
  echo "wt: removed $path"
}

cmd_clean() {
  git -C "$REPO_ROOT" worktree prune -v
  echo
  echo "Branches already merged into $TRUNK (safe to delete):"
  git -C "$REPO_ROOT" branch --merged "origin/$TRUNK" | grep -vE "^\*|  ($TRUNK)$" || echo "  none"
}

case "${1:-}" in
  new)   shift; cmd_new "$@" ;;
  ls)    cmd_ls ;;
  rm)    shift; cmd_rm "$@" ;;
  clean) cmd_clean ;;
  *)     sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
