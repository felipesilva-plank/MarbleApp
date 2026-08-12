# CLAUDE.md

Context for agents working in this repo. Read this before touching code.

## What this is

MarbleApp — stone inventory where **every piece records the piece it was cut from**. One
self-referencing `parentId` on `Piece` is the whole product; ancestry chains, descendant trees and
the "unlinked stone" backlog are all derived from it.

Frontend-only MVP. Data lives in the browser (localStorage for records, IndexedDB for photos).
There is no server. See `README.md` → Migration path for how the API slots in.

## Commands

```bash
npm install
npm run dev          # vite dev server, http://localhost:5173
npm test             # vitest, both workspaces
npm run typecheck    # tsc --noEmit, both workspaces
npm run build        # production build into apps/web/dist
```

Always run `npm run typecheck && npm test` before opening a PR. Both must be green.

## Layout

npm workspaces. `apps/api` will slot in beside `apps/web` later.

```
packages/core/       @marble/core — ZERO framework deps. Runs in browser AND node.
apps/web/src/
  data/ports.ts      THE CONTRACT — async interfaces shaped like the future REST API
  data/local/        localStorage + IndexedDB implementations of those interfaces
  data/index.ts      adapter selection — the one file the backend migration touches
  hooks/             TanStack Query hooks wrapping the ports
  components/        presentational + form components
  routes/            screens, one file per route
```

## Architecture rules

These are load-bearing. Breaking one is a bug even if types pass.

1. **Nothing above `data/` imports from `data/local/`.** Hooks, routes and components import from
   `../data` only. The local adapter is swappable; anything that reaches past the port pins us to
   the browser.
2. **`packages/core` stays framework-free.** No React, no DOM, no `node:` imports. It is compiled
   into the browser bundle *and* will be imported by the Fastify API.
3. **Ports are async even when the implementation is synchronous.** Loading and error states
   already exist in the UI because of this. Do not "simplify" a port to return a plain value.
4. **`orgId` and `createdBy` are never parameters.** The adapter derives them from the session,
   the way the API will derive them from a JWT.
5. **Lineage fields (`rootId`, `depth`) are derived, never hand-set.** Use `recomputeSubtree` from
   `@marble/core`. Reparenting must go through `assignParent`, which returns *every* piece whose
   lineage changed — not just the one that moved.
6. **Cutting a child never mutates the parent.** Kerf loss makes consumption math advisory; the
   app shows an estimate and the human sets the status.

## Conventions

- **Dimensions are integer millimetres.** `3200 × 1900 × 20 mm`. Never store floats; area in m² is
  derived by `areaM2`.
- **Zod schemas live in `packages/core/src/schemas.ts`** and are the single source of validation.
  The same schema object will validate API request bodies — do not duplicate validation in a form.
- **Components:** named exports, no default exports. Shared primitives come from
  `components/ui.tsx` (`Button`, `Card`, `Field`, `Input`, `Alert`, `EmptyState`, `Modal`,
  `PageHeader`, `SectionTitle`). Reach for those before writing new Tailwind.
- **Styling:** Tailwind v4 utility classes inline. The palette is `stone-*`; use `red-*` only for
  destructive actions. No CSS modules, no styled-components.
- **Imports:** relative within a workspace, `@marble/core` across. No path aliases in app code.
- **Errors:** throw `DomainError(code, message)` from `data/errors.ts`. Messages are shown to
  users verbatim, so write them for a fabricator, not a developer.
- **Naming:** `PascalCase.tsx` for components and routes, `camelCase.ts` for everything else. Test
  files sit next to the file they test: `filter.ts` → `filter.test.ts`.

## Testing

Three suites, each with a different job:

| Suite | Job |
| --- | --- |
| `packages/core/**/*.test.ts` | Lineage math, cycle detection, area, codes, filters, schemas. Pure functions, no mocks. |
| `apps/web/src/data/local/*.integration.test.ts` | The block → slab → remnant walk through the *real* adapters. No mocking the repository. |
| `apps/web/src/App.smoke.test.tsx` | Every route mounts against seeded data. Catches render crashes `tsc` and `vite build` cannot. |

New route → add it to the smoke test. New pure function in core → unit test it. New adapter
behaviour → extend the integration test rather than mocking.

## Git workflow

- Branch off `main`. Never commit to `main` directly.
- Branch names: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`.
- Small PRs. If a change needs another change to land first, stack it — base the child PR on the
  parent's branch, not on `main`.
- Commit subjects in the imperative mood, no trailing period: `Add saved filter presets`.

## Gotchas

- **localStorage caps near 5 MB.** Photos go to IndexedDB (`data/local/photos.ts`) — never write a
  data URL into a record.
- **jsdom has no `crypto.subtle`.** `src/test/setup.ts` swaps in Node's WebCrypto so PBKDF2 runs
  for real in tests. Don't stub the auth adapter.
- **The login is a UI gate, not security.** Everything is client-side. Do not add a feature that
  implies real access control until the API exists.
- **A block with no parent is not "unlinked".** It came from a quarry. Only remnants and finished
  pieces genuinely lost an origin — that's what `isUnlinked` encodes.
