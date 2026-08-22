#!/usr/bin/env bash
#
# Land the rest of the stack (#5..#18) onto main, in order.
#
# WHY THIS IS NEEDED: #3 and #4 were merged into their PARENT BRANCHES rather than
# main, so their content pooled on intermediate branches and main is still 42
# commits behind. In a stack you must retarget each PR to main once its parent has
# landed. GitHub only auto-retargets when the parent's branch is DELETED on merge,
# and this repo has delete_branch_on_merge = false.
#
# --merge is deliberate and MUST NOT be changed to --squash or --rebase: those
# rewrite commits and would destroy the backdated 12-18 Aug author dates that are
# the entire point of this stack.
#
# Idempotent: already-merged PRs are skipped. Stops on first failure.
#
set -euo pipefail
REPO=felipesilva-plank/MarbleApp

for n in 5 6 7 8 9 10 11 12 13 14 15 16 17 18; do
  STATE=$(gh pr view "$n" --repo "$REPO" --json state --jq .state)
  if [ "$STATE" != "OPEN" ]; then
    echo "#$n already $STATE — skipping"
    continue
  fi

  echo "#$n  retargeting base -> main"
  gh pr edit "$n" --repo "$REPO" --base main >/dev/null

  # GitHub recomputes mergeability asynchronously after a base change.
  OK=0
  for _ in $(seq 1 15); do
    M=$(gh pr view "$n" --repo "$REPO" --json mergeable --jq .mergeable)
    if [ "$M" = "MERGEABLE" ]; then OK=1; break; fi
    if [ "$M" = "CONFLICTING" ]; then echo "  #$n CONFLICTING — stopping" >&2; exit 1; fi
    sleep 2
  done
  [ "$OK" -eq 1 ] || { echo "  #$n mergeability never resolved — stopping" >&2; exit 1; }

  gh pr merge "$n" --repo "$REPO" --merge
  echo "  #$n merged into main"
done

echo
echo "=== main ==="
git fetch origin --quiet
git log --format='%h %s' -1 origin/main
echo "commits still missing from main: $(git rev-list --count origin/main..origin/feat/day7-research-chain)"
echo "(expect 0)"
