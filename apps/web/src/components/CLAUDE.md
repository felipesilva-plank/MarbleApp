# apps/web/src/components

Presentational components. Props in, JSX out.

## Before writing a new one

Read `ui.tsx`. It has `Button`, `Card`, `Field`, `Input`, `Select`, `Textarea`, `Alert`,
`EmptyState`, `Modal`, `Spinner`, `Loading`, `PageHeader`, `SectionTitle` and the `cx` helper.
Most "new components" are a composition of those, and review sends back anything that reimplements
one.

## Conventions

- **Named exports only.** No default exports anywhere in this app.
- **Props:** inline `{ ... }` annotation for one or two; a named `interface <Name>Props` at three
  or more. No `React.FC`, no `any`.
- **Data comes in as props.** The route calls the hook and passes the result down. That keeps every
  component renderable in a test with plain `render()` — no `QueryClientProvider`, no router. If a
  component cannot render standalone, it is doing the route's job.
- **Tailwind inline**, `stone-*` palette. `red-*` is reserved for destructive actions; `amber-*`
  for warnings. Conditional classes go through `cx`.
- **Accessibility is not optional.** An icon-only button gets `aria-label`. A meter gets
  `role="progressbar"` with `aria-valuenow`/`min`/`max`. A toggle gets `aria-pressed`. These are
  also what the tests query by, so getting them right makes the test easier to write.
- **No barrel file.** Routes import directly: `import { PresetBar } from '../components/PresetBar'`.
  An `index.ts` here would make every component eagerly reachable and defeat tree-shaking.

## Tests

Co-located `<Name>.test.tsx`, using plain `render()`.

Assert on what a user perceives — `getByRole`, `getByText`, `toBeDisabled`, `toHaveAttribute`.
**Never on class names.** A test that asserts `bg-stone-900` fails on a restyle and passes on a
broken feature, which is exactly backwards.

Always cover the empty/zero case. Components fail on empty arrays far more often than on populated
ones, and the seeded fixtures never surface it.
