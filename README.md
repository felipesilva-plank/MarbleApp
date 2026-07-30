# MarbleApp

Stone inventory with **provenance**: every piece records the piece it was cut from.

Marble fabricators cut large stone into smaller pieces, and every cut leaves usable offcuts —
**remnants** — that go back on the rack. The shop knows the remnants exist but not where they came
from, so a remnant that can't be matched to a job sits until someone scraps it.

MarbleApp fixes one thing: each piece stores a `parentId`. From that single self-referencing link
the app derives everything else — the ancestry chain (this remnant came from slab SLB-0001, sawn
from block BLK-0001), the descendant tree, and the backlog of pieces whose origin was never
recorded.

## Status

Frontend-only MVP. Data lives in the browser; there is no server yet. The code is deliberately
laid out so adding a Fastify + Postgres backend is additive — see
[Migration path](#migration-path).

> [!WARNING]
> **The login is a UI gate, not security.** Everything runs client-side, so anyone with devtools
> can read every record and edit the user list. Passwords are PBKDF2-hashed only so that the
> hashing code and session flow relocate cleanly to a real backend. Do not put a real customer's
> inventory in this until the API exists.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

A demo inventory (one block → three slabs → five remnants, plus two unlinked remnants and three
materials) is written on first load. Register any email and password to get in.

```bash
npm test           # 110 tests
npm run typecheck
npm run build
```

## Layout

npm workspaces. One app today; `apps/api` slots in beside `apps/web` later.

```
packages/core/      @marble/core — ZERO framework deps, runs in browser AND node
  types.ts          Piece / Material / User
  tree.ts           getAncestors, getDescendants, wouldCreateCycle, recomputeSubtree
  measure.ts        areaM2, consumptionSummary
  codes.ts          BLK-0001 / SLB-0042 code generation
  filter.ts         matchesFilter, isUnlinked
  schemas.ts        zod schemas — the same objects will validate API request bodies

apps/web/src/
  data/ports.ts     THE CONTRACT. Async interfaces shaped like the future REST API.
  data/local/       localStorage (records) + IndexedDB (photos) implementations
  data/index.ts     adapter selection — the one file migration touches
  hooks/            TanStack Query hooks wrapping the ports
  routes/           screens
```

### Key decisions

| Decision | Why |
| --- | --- |
| Records in `localStorage`, photos in **IndexedDB** | localStorage caps near 5 MB; a dozen photos exhaust it and then throw mid-save. |
| Dimensions as integer **millimetres** | Industry convention (`3200 × 1900 × 20 mm`) and no float drift. Area is derived, in m². |
| `rootId` + `depth` denormalized on each piece | "Everything from this block" is one filter instead of a recursive walk; becomes an indexed column in Postgres. |
| Cutting a child **never** mutates the parent | Kerf loss and irregular offcuts make consumption math advisory. The app shows an estimate; the human sets the status. |
| Reparenting is a first-class feature | The whole problem is that unlinked stone already exists. Adopting an orphan drags in cycle detection and subtree recomputation — the two most-tested functions here. |
| A block with no parent is **not** "unlinked" | It came from a quarry. Only remnants and finished pieces genuinely lost an origin (`isUnlinked`). |
| No graph library for the family tree | Recursive DOM with CSS connectors reflows on mobile and prints for free. |

## Migration path

Nothing below requires touching a component.

| Today | After |
| --- | --- |
| `packages/core` | **Unchanged.** Imported by `apps/web` and `apps/api` alike. |
| `apps/web/src/data/ports.ts` | **Unchanged.** It is the contract. |
| `apps/web/src/data/local/*` | Replaced by `data/http/*` — same interfaces over `fetch`. |
| `apps/web/src/data/index.ts` | One line: return the HTTP adapter. |
| `apps/web/src/hooks/*` | **Unchanged** — already async, already have loading/error states. |
| — | New `apps/api`: Fastify + Postgres, validating with the same zod schemas. |
| PBKDF2 in browser | Same derivation server-side; session record → JWT in an httpOnly cookie. |
| IndexedDB blobs | Object storage; `hasPhoto: boolean` → `photoUrl: string \| null`. |
| `orgId = 'org_local'` | Real orgs; every query filtered by the JWT's `orgId`. |
| Settings → Export JSON | Seeds the first Postgres database — no data loss at cutover. |

Implement the API to match this and the HTTP adapter writes itself:

```
list          GET    /api/pieces?q=&kind=&status=&materialId=&rootId=
get           GET    /api/pieces/:id
create        POST   /api/pieces
update        PATCH  /api/pieces/:id
assignParent  PUT    /api/pieces/:id/parent      { parentId }
remove        DELETE /api/pieces/:id?orphanChildren=true
setPhoto      PUT    /api/pieces/:id/photo       (multipart)
```

Postgres follows `Piece` directly: `parent_id uuid references pieces(id)`, indexes on
`(org_id, root_id)`, `(org_id, parent_id)`, `(org_id, status)`, unique `(org_id, code)`.

## Tests

| Suite | Covers |
| --- | --- |
| `packages/core` (68) | Lineage math, cycle detection, subtree recomputation, area/consumption, code generation, filters, schema validation. |
| `apps/web` integration (27) | The block → slab → remnant walk through the real adapters: auth, lineage, cycle rejection, orphan-on-delete, photo storage, backup round trip. |
| `apps/web` smoke (15) | Every route mounts against seeded data — catches render-time crashes that typecheck and `vite build` cannot. |
