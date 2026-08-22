# MarbleApp

Stone inventory with **provenance**: every piece records the piece it was cut from.

A fabricator buys slabs and cuts jobs out of them. Every cut leaves usable offcuts — **remnants** —
that go back on the rack. The shop knows the remnants exist but not where they came from, so a
remnant that can't be matched to a job sits until someone scraps it.

MarbleApp fixes one thing: each piece stores a `parentId`. From that single self-referencing link
the app derives everything else — the ancestry chain (this remnant came off slab SLB-0001), the
descendant tree, and the backlog of pieces whose origin was never recorded.

## The domain model, and what it is not

There are exactly two kinds of piece.

| | |
| --- | --- |
| **Slab** | What the shop buys. The quarry-to-block-to-slab chain happens upstream and never reaches the yard, so a slab with no parent is normal, not missing. |
| **Remnant** | What is left after a cut. Every one records a `remnantOrigin`: `offcut` from cutting a job, or `rejected` for a finished piece that came back. |

There is deliberately **no `block`** and **no `finished piece`**. Blocks are the quarry's business.
A finished piece is fabricated for one project and delivered to the customer's house — it is never
racked, so it is never inventory. The one exception is a job that comes back (wrong measurement,
bad edge, damage in transit): a replacement is fabricated, and the returned piece is resold as long
as another job can still be cut from it. That makes it a remnant, and `rejected` is how it enters.

This is the correction that reshaped the app. An earlier version had four kinds; `@marble/core` →
`migrate.ts` reads those exports into the current shape — a block becomes a slab, because deleting
it would orphan everything beneath it and destroy exactly the provenance this app exists to keep.

## Running it

```bash
npm install

createdb marble_dev
cp .env.example .env.local        # then set DATABASE_URL and VITE_API_URL

npm run db:migrate                # create the schema
npm run db:seed                   # a demo shop — prints its credentials
```

Two processes:

```bash
npm run dev:api                   # http://localhost:3001
npm run dev                       # http://localhost:5173
```

```bash
npm test                          # 462 tests
npm run typecheck
npm run pre-deploy                # typecheck + tests + build + env + lockfile, one verdict
```

The API suite needs a database of its own: `createdb marble_test`.

## Layout

npm workspaces. Three deployables and three shared packages.

```
packages/core/       @marble/core — ZERO framework deps. Runs in the browser AND in node.
  types.ts           Piece / Material / Org / User
  tree.ts            getAncestors, getDescendants, wouldCreateCycle, recomputeSubtree
  measure.ts         areaM2, consumptionSummary
  codes.ts           SLB-0001 / RMN-0042 code generation
  filter.ts          matchesFilter, isUnlinked
  schemas.ts         zod schemas — the API validates request bodies with these
  migrate.ts         reads a v1 (four-kind) export into the current shape
  errors.ts          DomainError, and the code → HTTP status map both ends agree on

apps/api/            Hono + Prisma + Postgres. A standalone server: `node dist/server.js`.
  prisma/schema.prisma   The database. Follows Piece directly.
  src/services/      Business rules. Lineage math is imported from core, not rewritten in SQL.
  src/routes/        HTTP. Thin — they parse, call a service, and shape a response.
  src/photos/        Object storage: Supabase when configured, local disk when not.

apps/web/            React + Vite SPA.
  data/ports.ts      THE CONTRACT
  data/http/         The only implementation. fetch, with the session cookie.
  hooks/             TanStack Query hooks wrapping the ports
  routes/            screens

apps/cli/            @marble/cli — the Anthropic API chat/agent REPL
packages/mcp-*/      MCP servers: a SQL snapshot of the inventory, and PostHog
```

### Key decisions

| Decision | Why |
| --- | --- |
| Two kinds, `slab` and `remnant` | It is what a shop actually handles. See above. |
| `remnantOrigin` required on every remnant | A remnant with no origin is a row nobody can act on later. Enforced once, in `schemas.ts`, so the form and the API cannot disagree. |
| Dimensions as integer **millimetres** | Industry convention (`3200 × 1900 × 20 mm`) and no float drift. Area is derived, in m². |
| `rootId` + `depth` denormalised on each piece | "Everything from this slab" is one indexed filter instead of a recursive walk. |
| Lineage math in `@marble/core`, not SQL | One tested implementation of the hardest logic in the product beats two that have to agree. Costs one indexed read per reparent. |
| Cutting a child **never** mutates the parent | Kerf loss and irregular offcuts make consumption math advisory. The app shows an estimate; the human sets the status. |
| Reparenting is a first-class feature | The whole problem is that unlinked stone already exists. Adopting an orphan drags in cycle detection and subtree recomputation — the two most-tested functions here. |
| A slab with no parent is **not** "unlinked" | It was bought from a supplier. Only a remnant genuinely lost an origin (`isUnlinked`). |
| Session cookie, not a token in localStorage | A token any script can read is a token an XSS bug walks off with. The cost is `SameSite=None; Secure` and explicit CORS origins. |
| Photos in object storage, never a column | Hundreds of MB a year of data that is only ever fetched by key. Keeping it out of Postgres keeps backups fast. |
| No graph library for the family tree | Recursive DOM with CSS connectors reflows on mobile and prints for free. |

## Deploying

The two halves deploy independently.

**Web** — a static SPA. `npm run build` → `apps/web/dist`. `vercel.json` is already set up for it.
Set `VITE_API_URL` to the API's origin at build time.

**API** — `npm run build:api` produces `apps/api/dist/server.js`, a ~45 kB bundle with
`@marble/core` compiled in. It runs anywhere Node does: a container, a VM, Fly, Render, Railway.
Run `npm run db:deploy` against the target database first. See `apps/api/README.md` for the full
environment.

The database is Postgres. Supabase is the intended host — it also provides the storage bucket for
photos — but nothing in the code is specific to it beyond a connection string and a bucket name.

## Tests

| Suite | Covers |
| --- | --- |
| `packages/core` (108) | Lineage math, cycle detection, subtree recomputation, area/consumption, code generation, filters, schema validation, the v1 backup migration. |
| `apps/api` (36) | The real HTTP app against a real Postgres: the slab → remnant walk, code collisions under concurrency, cycle rejection, orphan-on-delete, tenant isolation, photos, backup round trip. |
| `apps/web` (53) | Every route mounts against a seeded inventory served over a faked `fetch` — so the real HTTP adapter runs underneath, not a stub. |
| `apps/cli` (203), `packages/mcp-*` (62) | Tool loop, retries, SQL guard, snapshot loading. |

Nothing below the HTTP boundary is mocked in `apps/api`. Unique constraints, enum columns,
`onDelete: Restrict` on the lineage relation and transaction rollback are most of what that layer
is, and a fake would assert none of it.
