# CLAUDE.md

Context for agents working in this repo. Read this before touching code.

## What this is

MarbleApp — stone inventory where **every piece records the piece it was cut from**. One
self-referencing `parentId` on `Piece` is the whole product; ancestry chains, descendant trees and
the "unlinked stone" backlog are all derived from it.

A React SPA and a separate Hono + Postgres API. The browser holds no data: it talks to
`apps/api` over HTTP and nothing else.

**There are exactly two kinds of piece: `slab` and `remnant`.** No block (that happens at the
quarry, upstream of any shop) and no finished piece (those are delivered to the customer, never
racked). A finished piece re-enters only as a `rejected` remnant when a job comes back. Every
remnant carries a `remnantOrigin`; no slab does. See `README.md` → The domain model.

## Commands

```bash
npm install
createdb marble_dev && createdb marble_test
npm run db:migrate   # apply the schema
npm run db:seed      # demo shop; prints its credentials

npm run dev:api      # http://localhost:3001
npm run dev          # http://localhost:5173

npm test             # vitest, every workspace
npm run typecheck    # tsc --noEmit, every workspace
npm run build        # web → apps/web/dist
npm run build:api    # api → apps/api/dist/server.js
npm run pre-deploy   # all of the above plus env and lockfile checks, one verdict
```

Always run `npm run typecheck && npm test` before opening a PR. Both must be green.

## Layout

npm workspaces.

```
packages/core/       @marble/core — ZERO framework deps. Runs in browser AND node.
apps/api/
  prisma/schema.prisma  The database. Follows `Piece` directly.
  src/services/      Business rules. Lineage math imported from core, not rewritten in SQL.
  src/routes/        HTTP. Thin: parse, call a service, shape a response.
  src/app.ts         The Hono app. A plain fetch handler — server.ts adds the socket.
apps/web/src/
  data/ports.ts      THE CONTRACT
  data/http/         The only implementation: fetch, with the session cookie
  data/index.ts      adapter selection
  hooks/             TanStack Query hooks wrapping the ports
  components/        presentational + form components
  routes/            screens, one file per route
```

## Architecture rules

These are load-bearing. Breaking one is a bug even if types pass.

1. **Nothing above `data/` imports from `data/http/`.** Hooks, routes and components import from
   `../data` only. Anything that reaches past the port pins the UI to one transport.
2. **`packages/core` stays framework-free.** No React, no DOM, no `node:` imports. It is compiled
   into the browser bundle *and* imported by the API. Its relative imports carry explicit `.ts`
   extensions so Node can run them directly.
3. **Ports are async even when the implementation is synchronous.** Loading and error states
   already exist in the UI because of this. Do not "simplify" a port to return a plain value.
4. **`orgId` and `createdBy` are never parameters.** The server takes both from the session. A
   service that accepted an orgId from a request body would be a tenant-isolation hole.
5. **Lineage fields (`rootId`, `depth`) are derived, never hand-set.** Use `recomputeSubtree` from
   `@marble/core`. Reparenting must go through `assignParent`, which returns *every* piece whose
   lineage changed — not just the one that moved.
6. **Cutting a child never mutates the parent.** Kerf loss makes consumption math advisory; the
   app shows an estimate and the human sets the status.
7. **Every remnant has a `remnantOrigin`; no slab does.** The rule lives in `schemas.ts` alone.
   Do not re-check it in a form and do not let a `PATCH` leave a slab carrying one.
8. **Business logic lives in `apps/api`.** The browser renders and validates for the user's
   benefit; the server is what actually decides. A rule enforced only in the SPA is not enforced.

## Conventions

- **Dimensions are integer millimetres.** `3200 × 1900 × 20 mm`. Never store floats; area in m² is
  derived by `areaM2`.
- **Zod schemas live in `packages/core/src/schemas.ts`** and are the single source of validation.
  The API validates request bodies with the same objects — do not duplicate validation in a form.
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
| `packages/core/**/*.test.ts` | Lineage math, cycle detection, area, codes, filters, schemas, the v1 migration. Pure functions, no mocks. |
| `apps/api/src/api.integration.test.ts` | The slab → remnant walk through the real HTTP app against a real Postgres. Constraints, transactions and tenant isolation are the point — do not fake the database. |
| `apps/web/src/App.smoke.test.tsx` | Every route mounts against a seeded inventory served by `test/fakeApi.ts` over `fetch`. Catches render crashes `tsc` and `vite build` cannot. |

New route → add it to the smoke test. New pure function in core → unit test it. New endpoint or
new server-side rule → extend the API integration test. Faking the *network* rather than the
repository is deliberate: it keeps `data/http` on the tested path.

`createdb marble_test` before running the API suite. It is TRUNCATEd between tests, so never
point `TEST_DATABASE_URL` at anything you want to keep.

## Git workflow

- Branch off `main`. Never commit to `main` directly.
- Branch names: `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`.
- Small PRs. If a change needs another change to land first, stack it — base the child PR on the
  parent's branch, not on `main`.
- Commit subjects in the imperative mood, no trailing period: `Add saved filter presets`.

## Gotchas

- **A slab with no parent is not "unlinked".** It was bought from a supplier. Only a remnant
  genuinely lost an origin — that's what `isUnlinked` encodes.
- **Prisma's client is generated.** After changing `schema.prisma`, run `npm run db:migrate`
  (which regenerates) or nothing will typecheck.
- **Photos cross the wire as multipart and live in the UI as data URLs.** The conversion happens
  in `data/http/pieceRepo.ts` and must not leak either way past it. Never put a data URL in a row.
- **`apps/api` runs `src/server.ts` directly in dev** via Node's type stripping, which is why
  every relative import in `apps/api` and `packages/core` needs an explicit `.ts` extension.
- **Deleting a piece with children is refused by the database too.** `onDelete: Restrict` on the
  lineage relation is the backstop; the service detaches children explicitly or fails.
