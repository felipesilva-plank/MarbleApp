#!/usr/bin/env bash
#
# Push the 7-day stack (17 branches, 44 commits) and open every PR.
#
# USAGE — from inside your MarbleApp checkout:
#
#   1. Import the branches from the bundle I sent you:
#        git fetch /path/to/marble-stack.bundle 'refs/heads/*:refs/heads/*'
#      (If a branch name already exists locally, add --force.)
#
#   2. Run this:
#        bash push-stack.sh
#
# `gh` is OPTIONAL. Without it the script still pushes every branch and then prints
# a ready-made "create PR" URL per branch, with the correct base already selected -
# you click seventeen links instead of running seventeen commands.
#
# With `gh` authenticated (`gh auth status`) it opens all seventeen for you.
#
# Idempotent: re-running pushes updated branches and skips PRs that already exist,
# retargeting their base if it drifted.
#
# What it does:
#   - Pushes `main`, which already contains the inventory MVP merged as of Aug 11.
#     GitHub will mark PR #1 as merged automatically.
#   - Pushes the 17 feature branches.
#   - Opens 17 PRs, each based on the previous branch (a linear stack), with a
#     Stack section linking the parent.
#
set -euo pipefail

REPO=felipesilva-plank/MarbleApp
TRUNK=main

BRANCHES=(
  chore/day1-claude-md-and-permissions
  chore/day1-github-workflow
  feat/day1-settings-app-info
  feat/day2-claude-skills
  feat/day2-review-subagents
  chore/day3-mcp-integrations
  docs/day3-spec-workflow
  feat/day3-saved-filter-presets
  chore/day4-worktree-tooling
  docs/day4-nested-claude-md
  feat/day4-parallel-features
  feat/day5-inventory-mcp-server
  feat/day5-posthog-mcp-and-analytics
  feat/day6-anthropic-client
  feat/day6-cli-chatbot
  feat/day7-tool-use
  feat/day7-research-chain
)

TITLES=(
  "Day 1: project CLAUDE.md and shared Claude Code permissions"
  "Day 1: CI, PR template, CODEOWNERS and the workflow doc"
  "Day 1: show storage headroom and build identity in Settings"
  "Day 2: /component, /api-route and /pre-deploy skills"
  "Day 2: PR review sub-agent trio and Claude Code hooks"
  "Day 3: Linear, GitHub and Figma MCP servers + the AI SDLC doc"
  "Day 3: spec templates and an 18-ticket backlog"
  "Day 3: MAR-11 saved filter presets, built from a spec"
  "Day 4: worktree helper and stacked-PR mechanics"
  "Day 4: folder-level CLAUDE.md files and a prompting guide"
  "Day 4: three features shipped in parallel (MAR-19, MAR-22, MAR-25)"
  "Day 5: a SQLite-backed MCP server over the inventory"
  "Day 5: PostHog MCP server and a typed analytics catalog"
  "Day 6: Anthropic client with cost accounting and narrated retries"
  "Day 6: the chat REPL"
  "Day 7: four tools and the agent loop"
  "Day 7: the /research four-step chain"
)

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

for b in "${BRANCHES[@]}"; do
  git rev-parse --verify --quiet "$b" >/dev/null || {
    echo "Missing branch: $b" >&2
    echo "Import the bundle first:  git fetch /path/to/marble-stack.bundle 'refs/heads/*:refs/heads/*'" >&2
    exit 1
  }
done

HAVE_GH=0
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  HAVE_GH=1
else
  echo
  echo "note: gh is not installed or not authenticated."
  echo "      Branches will still be pushed; PR links will be printed for you to click."
fi

say "1/3  Pushing $TRUNK (this closes PR #1 as merged)"
git push origin "$TRUNK"

say "2/3  Pushing ${#BRANCHES[@]} branches"
git push --force-with-lease origin "${BRANCHES[@]}"

if [ "$HAVE_GH" -eq 0 ]; then
  say "3/3  Open these seventeen PRs (base is pre-selected in each link)"
  PARENT="$TRUNK"
  for i in "${!BRANCHES[@]}"; do
    BRANCH="${BRANCHES[$i]}"
    printf '\n%s\n  https://github.com/%s/compare/%s...%s?expand=1\n' \
      "${TITLES[$i]}" "$REPO" "$PARENT" "$BRANCH"
    PARENT="$BRANCH"
  done
  echo
  echo "Open them bottom-to-top so each PR can link its parent's number in the body."
  exit 0
fi

say "3/3  Opening pull requests"
PARENT="$TRUNK"
PARENT_PR=""

for i in "${!BRANCHES[@]}"; do
  BRANCH="${BRANCHES[$i]}"
  TITLE="${TITLES[$i]}"

  EXISTING=$(gh pr list --repo "$REPO" --head "$BRANCH" --state open --json number --jq '.[0].number' 2>/dev/null || true)

  if [ -n "$EXISTING" ]; then
    echo "  #$EXISTING already open for $BRANCH — retargeting base to $PARENT"
    gh pr edit "$EXISTING" --repo "$REPO" --base "$PARENT" >/dev/null
    NUMBER="$EXISTING"
  else
    COMMITS=$(git log --format='- %s' "$PARENT..$BRANCH")

    if [ "$PARENT" = "$TRUNK" ]; then
      STACK="## Stack

Bottom of the stack — based on \`$TRUNK\`. Sixteen PRs are stacked above this one; merge top-down."
    else
      STACK="## Stack

- Parent: #$PARENT_PR — must land first
- Based on \`$PARENT\`, not \`$TRUNK\`. Merge top-down; retarget to \`$TRUNK\` once the parent lands."
    fi

    BODY="## What

$COMMITS

$STACK

## Verification

- [x] \`npm run typecheck\`
- [x] \`npm test\`
- [x] \`npm run build\`
- [x] \`npm run pre-deploy\` — 6/6

Reviewed with the correctness / performance / security sub-agent trio; findings fixed on the branch that owned them."

    NUMBER=$(gh pr create --repo "$REPO" --base "$PARENT" --head "$BRANCH" \
      --title "$TITLE" --body "$BODY" | grep -oE '[0-9]+$')
    echo "  #$NUMBER  $BRANCH  ->  $PARENT"
  fi

  PARENT="$BRANCH"
  PARENT_PR="$NUMBER"
done

say "Done. The stack:"
gh pr list --repo "$REPO" --state open --limit 40 \
  --json number,title,headRefName,baseRefName \
  --jq '.[] | "#\(.number)  \(.headRefName) -> \(.baseRefName)"'
