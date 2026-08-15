# apps/web/src/routes

One file per screen. Routes are where data fetching, URL state and layout meet — and the only
layer allowed to do all three.

## Responsibilities

A route may: call hooks, read and write URL search params, own local UI state, compose components,
and render loading and error states.

A route may **not**: import from `data/local/`, contain domain logic that `packages/core` should
own, or reimplement a primitive from `components/ui.tsx`.

## URL state over component state

Filters, sort, view mode and pagination live in `useSearchParams`, not `useState`.

That is what makes a view shareable, back-button-correct, reload-proof, and — as saved presets
showed — persistable for free, because a saved filter is just a saved query string. Reach for
`useState` only for genuinely ephemeral UI: whether a menu is open, what is typed in an unsubmitted
field.

Use `setParams(next, { replace: true })` for filter changes. Pushing a history entry per keystroke
makes the back button useless.

## Loading and error states

Every query has both. The ports are async today precisely so these already exist when the HTTP
adapter lands.

- Loading → `<Loading />`, or a skeleton where the layout would otherwise jump.
- Error → `<Alert>{errorMessage(caught)}</Alert>`. `errorMessage` unwraps `DomainError` and falls
  back safely for anything else.
- Empty → `<EmptyState />` with a **next action**. A bare "No results" tells the user nothing they
  did not know.

## Adding a route

1. Create `routes/<Name>.tsx` with a named export.
2. Register it in `App.tsx`, inside the `ProtectedRoute` block unless it is genuinely public
   (`/login`, `/register`).
3. Add a link somewhere a user can reach it. An unreachable route is a bug the smoke suite cannot
   catch.
4. **Add it to `App.smoke.test.tsx`.** That suite mounts every route against seeded data and is the
   only thing that catches a render-time crash — `tsc` and `vite build` both pass on a component
   that throws on mount.

## Testing

Routes are covered by the smoke suite rather than one test file each. If a route grows logic worth
testing directly, that is the signal to extract it: a pure function into `packages/core`, or a
presentational component into `components/` with its own test.
