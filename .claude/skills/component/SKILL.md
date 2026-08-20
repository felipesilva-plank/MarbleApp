---
name: component
description: Scaffold a React component in apps/web with a co-located render test and a barrel export. Use when adding any new component to the web app, or when the user types /component.
---

# Scaffold a component

Create a component that looks like it was always there. Read `apps/web/src/components/ui.tsx`
first — most "new" components are a composition of `Card`, `Field`, `Button` and `EmptyState`, and
the review will send back anything that reimplements them.

## Arguments

`$1` — component name in PascalCase (e.g. `ConsumptionBar`).
`$2` — optional: `routes` to place it in `src/routes/` instead of `src/components/`.

## Steps

1. **Read the conventions.** `CLAUDE.md`, then `apps/web/src/components/ui.tsx`, then the two
   components alphabetically nearest the new name. Match their import order, prop-typing style and
   Tailwind vocabulary rather than inventing.

2. **Write `apps/web/src/components/<Name>.tsx`:**
   - Named export, no default export.
   - Props typed with an inline `{ ... }` annotation for one or two props; a named
     `interface <Name>Props` once there are three or more.
   - No `React.FC`. No `any`.
   - Presentational by default: props in, JSX out. If it needs data, take it as a prop and let the
     route call the hook — that keeps the component testable without a QueryClient.
   - Tailwind only, `stone-*` palette, `red-*` reserved for destructive actions.
   - Use `cx` from `./ui` for conditional classes.
   - Anything interactive gets an accessible name and the right role. A meter gets
     `role="progressbar"` with `aria-valuenow`/`min`/`max`; an icon-only button gets `aria-label`.

3. **Write `apps/web/src/components/<Name>.test.tsx`:**
   - `render(<Name {...props} />)` from `@testing-library/react` — no `renderApp`, no router, no
     QueryClient. If the component cannot render standalone, it is doing too much.
   - Assert on what a user sees: `getByRole`, `getByText`. Never on class names.
   - At minimum: renders with typical props, and handles the empty/zero case. Components fail on
     empty arrays far more often than on populated ones.

4. **Export it.** `apps/web/src/components/` has no barrel file — routes import directly
   (`import { Name } from '../components/Name'`). Do not add an `index.ts`; adding one would make
   every component eagerly reachable and defeat tree-shaking. If a barrel exists in the target
   directory, add the export in alphabetical order.

5. **Verify.** `npm run typecheck && npm test`. Both must pass before you report done.

## Do not

- Add a prop "for later". Add it when the second caller needs it.
- Reach into `data/local/` — components talk to hooks, hooks talk to ports.
- Add a new dependency to render something. This app has React, Tailwind and nothing else on the
  view layer, on purpose.
