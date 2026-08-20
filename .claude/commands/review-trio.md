---
description: Review the current PR with three parallel sub-agents (correctness, performance, security) and aggregate their findings into one summary.
argument-hint: "[pr-number]"
allowed-tools: Task, Bash, Read, Grep, Glob
---

Run a three-angle review of $ARGUMENTS (default: the current branch's diff against `main`).

## 1. Establish the diff once

```bash
git fetch origin main --quiet
git diff origin/main...HEAD --stat
```

If a PR number was given, use `gh pr diff $ARGUMENTS` instead and note the PR title.

If the diff is empty, say so and stop.

## 2. Fan out

Launch all three sub-agents **in a single message** so they run concurrently — that is the whole
point. Sequential runs take three times as long for no extra signal.

- `correctness-reviewer`
- `performance-reviewer`
- `security-reviewer`

Give each the same context: the branch name, the PR title if there is one, and the list of changed
files. Do not summarise the diff for them — each one reads the code itself, and a summary is where
the finding you care about gets dropped.

## 3. Aggregate

Produce one summary, in this order:

1. **Verdict** — `Ship it`, `Ship with follow-ups`, or `Blocked`, plus a one-line reason.
   `Blocked` requires at least one finding marked blocking or exploitable-now.
2. **Blocking findings** — merged across all three reviewers, most severe first.
3. **Non-blocking findings** — grouped by reviewer.
4. **Nobody flagged** — one line naming what was reviewed and came back clean. This matters: a
   review that only ever lists problems gives no signal that the clean parts were actually read.

Deduplicate. Three reviewers looking at one hunk will often report the same defect through
different lenses — merge those into a single finding and note that it was flagged by more than one,
which is itself evidence it is real.

Do not soften a finding to make the verdict tidier, and do not invent findings to balance the
sections. `0 findings` across all three is a legitimate and common outcome on a small PR.
