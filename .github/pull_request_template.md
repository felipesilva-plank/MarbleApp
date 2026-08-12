## What

<!-- One or two sentences. What changes for a user of the app? -->

## Why

<!-- The problem, not the solution. Link the ticket if there is one. -->

## Stack

<!-- Delete if this PR is based on main. Otherwise: -->
<!-- - Parent: #<pr-number> - must land first -->

## Verification

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] Preview deploy checked in a browser
- [ ] New route added to the smoke suite (or n/a)

## Architecture check

<!-- The rules in CLAUDE.md that typecheck cannot enforce. Tick or explain. -->

- [ ] Nothing above `data/` imports from `data/local/`
- [ ] `packages/core` still has zero framework/DOM/node imports
- [ ] Lineage fields (`rootId`, `depth`) are derived, not hand-set
- [ ] Validation lives in `packages/core/src/schemas.ts`, not duplicated in a form

## Review

<!-- Reviewed with /codex:review. Note anything it flagged that you chose not to act on. -->
