# packages/core

Domain logic. Pure TypeScript, zero framework dependencies.

## The rule

**No React, no DOM, no `node:` imports. Ever.**

This package is compiled into the browser bundle today and will be imported by `apps/api` in
Node tomorrow. One `node:crypto` import breaks the browser build; one `document` reference breaks
the server. `zod` is the only runtime dependency, because the API needs the same schemas.

If a function needs the current time or a random id, **take it as an argument**. Do not reach for
`Date.now()` or `crypto.randomUUID()` here — that is the adapter's job, and it is also what makes
these functions testable without mocking a clock.

## Files

| File | Holds |
| --- | --- |
| `types.ts` | Entities and the label/grouping constants derived from them |
| `tree.ts` | `getAncestors`, `getDescendants`, `wouldCreateCycle`, `recomputeSubtree`, `buildTree` |
| `measure.ts` | `areaM2`, `consumptionSummary`, formatting for area and dimensions |
| `codes.ts` | `BLK-0001` / `SLB-0042` generation, `deriveCounters` |
| `filter.ts` | `matchesFilter`, `applyFilter`, `isUnlinked` |
| `presets.ts` | Saved filter query normalisation, slug, human summary |
| `schemas.ts` | Every zod schema. The API will validate request bodies with these unchanged. |

## Invariants these functions encode

Changing any of these is a product decision, not a refactor.

1. **`rootId` and `depth` are derived.** `recomputeSubtree` is the only thing that may set them.
   A caller assigning either literally is a bug even when the value happens to be right.
2. **`wouldCreateCycle` is checked before every reparent.** The piece graph is a forest; a cycle
   makes `getAncestors` loop forever, and it is reachable through ordinary UI actions.
3. **A block or slab with no parent is not unlinked.** It arrived from a quarry or a supplier.
   Only `DERIVED_KINDS` — remnant, finished — genuinely lost an origin. `isUnlinked` is the single
   place that distinction lives.
4. **Dimensions are integer millimetres.** Area in m² is derived, never stored. No floats in, no
   float drift out.
5. **Consumption is advisory.** `consumptionSummary` estimates; kerf loss and irregular offcuts
   mean it cannot be exact, and nothing here may set a status from it.

## Tests

Every exported function has unit tests in a co-located `*.test.ts`. No mocks — these are pure
functions, and if a test needs a mock the function has a dependency it should not have.

The cases worth writing first, because they are what breaks: empty array, single node, a piece
whose `parentId` points at something that no longer exists, and a chain deep enough to notice an
O(n²) walk.

## Adding to this package

Ask whether it is domain logic or app logic. "Which pieces fit this cut?" is domain. "Which pieces
are currently selected?" is app state and belongs in `apps/web`. When in doubt: if `apps/api` would
also need it, it goes here.
