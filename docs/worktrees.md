# Parallel work with git worktrees

Four agents cannot share one working directory. The moment two of them edit the same file the
results are garbage, and the moment one runs `git checkout` the other's context is wrong.

A worktree is a second (third, fourth) checkout of the same repository, on its own branch, sharing
one `.git`. That is the whole idea: **one worktree per feature, one agent per worktree.**

## The helper

```bash
./scripts/wt.sh new saved-presets        # ../marble-saved-presets on feat/saved-presets
./scripts/wt.sh new fix-thumb-leak fix   # ../marble-fix-thumb-leak on fix/fix-thumb-leak
./scripts/wt.sh ls                       # every worktree, its branch, whether it is dirty
./scripts/wt.sh rm saved-presets         # refuses if there are uncommitted changes
./scripts/wt.sh clean                    # prune stale entries, list merged branches
```

`new` branches from `origin/main`, symlinks `node_modules` from the primary checkout, and copies
`.env.local` across.

For a stacked PR's child, branch from the parent instead:

```bash
WT_BASE=feat/preset-storage ./scripts/wt.sh new preset-ui
```

## What the helper is doing, and why

**Branch from `origin/main`, not from `HEAD`.** `git worktree add` defaults to the current commit.
If you happen to be on a half-finished branch, the new worktree inherits it and you have entangled
two features that were supposed to be independent. Reaching for `WT_BASE` should feel deliberate.

**Symlink `node_modules` rather than installing.** npm workspaces hoist everything to the repo
root, so a fresh worktree has no dependencies at all and a full install takes ~40 s per worktree.
The symlink is instant and correct **as long as the lockfile matches** — which the helper checks by
comparing `package-lock.json`, falling back to telling you to install. If a feature adds a
dependency, that worktree needs a real install; nothing else is affected.

**Copy `.env.local`.** It is gitignored, so a new worktree has none, and the app then misbehaves in
ways that look like a code problem for about ten minutes.

**Remove the symlink before checking whether a worktree is dirty.** `.gitignore` lists
`node_modules/` with a trailing slash, which does not match a symlink — so an un-removed link makes
every worktree read as "has uncommitted changes" and `rm` refuses forever.

## The full parallel setup

1. Pick 3–4 independent tickets from `docs/backlog.md`. **Independent** is doing the work here: two
   tickets touching `PieceList.tsx` are not parallel, they are a merge conflict scheduled for later.
2. `./scripts/wt.sh new <slug>` for each.
3. In cmux, one workspace for MarbleApp, split panes, `claude` in each worktree.
4. Give each agent its ticket and its spec. Then leave them alone — the win is attention, not typing
   speed, and it evaporates if you supervise each one keystroke by keystroke.
5. Notification rings tell you which pane needs input. Answer that one, go back to reviewing.
6. As each finishes: `npm run pre-deploy` → `/review-trio` → PR.

## Merging parallel work

Land them one at a time, smallest first. After each merge, the others rebase:

```bash
cd ../marble-<slug>
git fetch origin
git rebase origin/main
```

Conflicts here are cheap because each branch is small. They are expensive when four agents each
worked for three hours — which is the actual argument for small PRs, restated.

If two features genuinely need the same file, do not run them in parallel. Stack them: build the
first, base the second on its branch (`WT_BASE=`), and let the child rebase when the parent lands.
`docs/stacking.md` covers the mechanics.

## Gotchas

| Thing | What happens |
| --- | --- |
| Same branch in two worktrees | Git refuses. This is a feature. |
| Deleting a worktree directory with `rm -rf` | Leaves a stale entry; `wt.sh clean` prunes it. |
| A feature adds a dependency | Its worktree needs a real `npm install` — the shared symlink is now wrong for it alone. |
| `.env.local` changes after a worktree exists | Not re-copied. Copy it again by hand. |
| Vite dev servers | Each worktree wants port 5173. Run `npm run dev -- --port 5174` in the second. |
| Disk | Each worktree is a full checkout of the source (~4 MB here). The symlink is what keeps it from being ~400 MB. |

## When not to bother

One small change. A change you will finish in ten minutes. Anything where you would spend longer
setting up the worktree than doing the work. `git checkout -b` is still fine — worktrees are for
parallelism, not for branching.
