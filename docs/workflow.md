# Development workflow

The loop is: **branch → build with Claude Code → PR → review → preview → merge**. It should take
minutes, not hours. If a step reliably costs more than a few minutes, that step is the bug.

## Branching

Always off `main`, never on `main`.

```bash
git checkout main && git pull
git checkout -b feat/saved-filter-presets
```

| Prefix | For |
| --- | --- |
| `feat/` | New user-visible behaviour |
| `fix/` | Something is wrong |
| `chore/` | Tooling, CI, config, deps |
| `docs/` | Documentation only |

Slug is kebab-case and describes the outcome, not the mechanism: `feat/saved-filter-presets`, not
`feat/add-localstorage-key`.

### Stacking

If a change needs another to land first, do **not** wait. Branch off the parent and base the PR on
the parent's branch:

```bash
git checkout -b feat/preset-ui feat/preset-storage
gh pr create --base feat/preset-storage
```

Two rules keep a stack sane: retarget children to `main` after the parent merges
(`gh pr edit <n> --base main`), and rebase with `--force-with-lease`, never `--force`. Full details
in `docs/stacking.md`.

## Size

One reviewable idea per PR. A PR that needs a paragraph to explain what it does is two PRs.

This is not a style preference — it is what makes the loop fast. Small PRs get reviewed in one
pass, deploy to a preview you can actually check, and revert cleanly. The throughput target for a
practice session is **5–10 PRs/hour**, which is only reachable if each one is small enough to hold
in your head.

## Opening the PR

```bash
gh pr create --fill                       # from main
gh pr create --base <parent-branch>       # stacked
```

`.github/pull_request_template.md` is applied automatically. The architecture checklist is not
ceremony — those four boxes are the invariants that `tsc` cannot check, and they are exactly what
an agent gets wrong when it is moving fast.

## Review

Every PR gets an agent pass before a human one:

```
/codex:review                 # correctness, patterns, obvious defects
/codex:adversarial-review     # challenges the design and the assumptions behind it
```

Use the adversarial variant when the PR introduces a pattern rather than following one — a new
directory, a new dependency, a change to `ports.ts`. It is worth the extra minute precisely when
you are least likely to notice you have made a decision.

Note anything the review flagged that you chose **not** to act on, and why. A dismissed finding
with a reason is useful review context; a silently ignored one looks like it was never read.

## CI

`.github/workflows/ci.yml` runs typecheck, test and build. Run all three locally first — waiting
on CI to discover a type error is the slowest possible way to find it.

```bash
npm run typecheck && npm test && npm run build
```

## Deploy

Vercel is linked to the repo. The flow is automatic:

| Event | Result |
| --- | --- |
| Push to any branch with an open PR | Preview deployment, URL commented on the PR |
| Merge to `main` | Production deployment |

Build config is in `vercel.json`: `npm run build` → `apps/web/dist`, with an SPA rewrite so
client-side routes survive a hard refresh. It is a monorepo, so the output directory is *not* the
project root — changing the workspace layout means changing `vercel.json`.

**Always open the preview URL before merging.** The app is browser-storage-backed; a preview
starts with a seeded inventory, which is the only realistic way to see what a first-time user sees.

## Merging

Squash-merge to `main` — one commit per PR keeps history readable and revertable.

The exception is a PR with children stacked on it: squashing rewrites its commits, which makes
every child's rebase noisier. Use "Rebase and merge" for parents of a stack.
