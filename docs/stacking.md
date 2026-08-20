# Stacked PRs

A stack is a chain of branches where each one's parent is another open PR's branch instead of
`main`. You reach for it when a change needs another change to land first and you do not want to
wait — which, at the pace this repo is meant to move, is most of the time.

The alternative is one large PR, and a large PR is not reviewed. It is skimmed.

## Creating a child

```bash
git checkout feat/preset-storage          # the parent
git pull origin feat/preset-storage
git checkout -b feat/preset-ui
# ...work...
gh pr create --base feat/preset-storage   # NOT --base main
```

In its own worktree:

```bash
WT_BASE=feat/preset-storage ./scripts/wt.sh new preset-ui
```

**`--base` is the whole trick.** Target `main` from a stacked branch and the diff includes every
one of the parent's commits — reviewers see a mess and stop reading.

Say so in the PR body; the template has a slot:

```
## Stack
- Parent: #41 — must land first
```

## The parent moved

Review fixes on the parent mean the child needs rebasing:

```bash
git checkout feat/preset-ui
git fetch origin
git rebase origin/feat/preset-storage
git push --force-with-lease origin feat/preset-ui
```

**Always `--force-with-lease`, never `--force`.** It refuses when the remote has commits you have
not seen — which is the difference between a rebase and losing someone's work. `--force` is in the
`deny` list in `.claude/settings.json` for this reason.

## The parent landed

Two steps, in this order:

```bash
gh pr edit <child-pr> --base main         # retarget first
git checkout feat/preset-ui
git fetch origin
git rebase origin/main                    # then drop the parent's now-merged commits
git push --force-with-lease origin feat/preset-ui
git branch -d feat/preset-storage
```

If the stack is deeper, repeat for the next child — it is the new bottom.

**If the parent was squash-merged**, a plain rebase sees each of the parent's original commits as
unmerged and replays them as conflicts. Use the explicit form instead:

```bash
git rebase --onto main <old-parent-tip> feat/preset-ui
```

This is why `docs/workflow.md` says to use "Rebase and merge" on the parent of a stack. Squashing
is right for everything else.

## Seeing the stack

```bash
gh pr list --author "@me" --state open \
  --json number,title,headRefName,baseRefName \
  --jq '.[] | "#\(.number) \(.title)  [\(.headRefName) -> \(.baseRefName)]"'
```

Anything whose base is not `main` is stacked.

## Landing the whole stack

**Top-down, always.** Merge the highest PR into its parent, then the next, then the next, and the
bottom one into `main` last.

Merge a lower one first and the parent branch carries up **without** the higher PR's changes —
and GitHub will still show the higher PR as "merged", because its base branch absorbed its head.
The badge is green and the code is nowhere. Verify rather than trusting it:

```bash
gh pr view <n> --json mergeCommit --jq '.mergeCommit.oid'
git merge-base --is-ancestor <sha> origin/main && echo "in main" || echo "ORPHANED"
```

An `ORPHANED` result means cherry-picking that commit onto `main` in a fresh PR.

## Gotchas

- **CI on a child runs against the parent's tip.** A red child is often the parent's fault — check
  the parent's PR before debugging your own.
- **Do not stack more than about four deep.** Every rebase after that costs more than the
  parallelism saved. Deeper than four usually means the bottom PR should have been merged already.
- **Do not stack unrelated work.** Stacking couples the review of A to the review of B. If B does
  not need A, branch B off `main`.
