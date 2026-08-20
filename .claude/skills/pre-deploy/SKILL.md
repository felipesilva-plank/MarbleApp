---
name: pre-deploy
description: Run the full pre-deploy gate - typecheck, tests, build, stray console.log detection, and required env var verification - and report a single pass/fail summary. Use before merging or deploying, or when the user types /pre-deploy.
---

# Pre-deploy gate

Runs every check that should have been run, in one pass, and reports one verdict.

```bash
node scripts/pre-deploy.mjs
```

Add `--fix-hints` for a suggested command per failure, or `--json` for machine-readable output.

## What it checks

| Check | Fails when | Why it is here |
| --- | --- | --- |
| Typecheck | `tsc --noEmit` errors in either workspace | - |
| Tests | Any vitest suite fails | - |
| Build | `vite build` errors | Catches bad import paths and purged Tailwind classes that typecheck cannot see |
| `console.log` | Any `console.log`/`debug`/`dir`/`table`/`trace` in `apps/*/src` or `packages/*/src`, excluding tests | Debug output shipped to production leaks inventory data into a customer's devtools |
| Env vars | A name in `.env.example` is absent from both the environment and `.env.local` | The app dies on first load instead of at build time |
| Lockfile | A `package.json` changed without `package-lock.json` | `npm ci` in CI fails on drift |

`console.warn` and `console.error` are allowed - those are intentional signals, not leftovers.

## How to run it

1. Run `node scripts/pre-deploy.mjs`. It exits non-zero on any failure.
2. If it fails, **fix the failures, do not weaken the check.** Adding an exclusion is a change that
   needs its own justification in the PR.
3. Re-run until clean, then report the summary table to the user verbatim. Do not paraphrase a
   pass - the point of a gate is that its output is auditable.

## When the gate is wrong

If a check is genuinely wrong for a case - a deliberate debug utility, say - annotate that single
line with `// pre-deploy:allow-console` and explain it in the PR. Never a blanket ignore, never
`--no-verify`.

## Note on secrets

The env check reads variable *names* from `.env.local` and never their values, so a failing run is
safe to paste into a PR comment.
