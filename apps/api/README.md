# @marble/api

The MarbleApp backend. Hono over Prisma over Postgres.

It is a standalone server, not a function bundle: `node dist/server.js` and it is running. The
application itself (`src/app.ts`) is a plain fetch handler with no host assumptions — `server.ts`
wraps it in a Node HTTP server, and the test suite calls it directly with no socket involved.

## Running it

```bash
createdb marble_dev
echo "DATABASE_URL=postgresql://localhost:5432/marble_dev" > apps/api/.env

npm run db:migrate    # apply migrations
npm run db:seed       # a demo shop, so a fresh database is clickable
npm run dev:api       # http://localhost:3001
```

`npm run db:seed` prints the demo credentials. `GET /health` runs a real query, because a process
that cannot reach Postgres is not up.

## Endpoints

Every route below `/api/auth` requires a session, and every one of them derives `orgId` from that
session rather than from the request. A client cannot read or write another shop's inventory by
changing a payload, and asking for a piece that belongs to someone else answers 404 rather than
403 — confirming that an id exists elsewhere is itself a leak.

| | |
| --- | --- |
| `POST /api/auth/register` | Creates the shop *and* the account, owner role. There is no state where a user exists without an org. |
| `POST /api/auth/login` · `POST /api/auth/logout` | Sets / clears the session cookie. |
| `GET /api/auth/me` | 200 with `{ user: null }` when signed out — the app's boot call, not a failure. |
| `GET /api/pieces` | Filters: `q kind remnantOrigin status materialId location rootId parentId minLengthMm minWidthMm thicknessMm orphansOnly`. |
| `POST /api/pieces` · `PATCH /api/pieces/:id` | |
| `PUT /api/pieces/:id/parent` | Returns **every** piece whose lineage changed, not just the one that moved. |
| `DELETE /api/pieces/:id?orphanChildren=true` | Refuses without the flag when anything was cut from it. |
| `PUT /api/pieces/:id/photo` | `multipart/form-data`, field `photo`. `DELETE` clears, `GET` serves the bytes. |
| `GET|POST /api/materials` · `PATCH|DELETE /api/materials/:id` | |
| `GET|POST /api/presets` · `DELETE /api/presets/:id` | |
| `GET|POST /api/backup` | Whole-inventory export and restore. |

Errors are always `{ error: { code, message } }`. The code is a `DomainErrorCode` from
`@marble/core` and maps to the status via `DOMAIN_ERROR_STATUS`; the web app rebuilds the same
`DomainError` class from those two fields, so a component branching on `code === 'HAS_CHILDREN'`
reads identically to the service that raised it.

## Decisions worth knowing before you change something

**Lineage math is imported, not reimplemented in SQL.** `wouldCreateCycle` and `recomputeSubtree`
come from `@marble/core` and operate on arrays, so a reparent loads the org's pieces, runs them,
and writes back what changed. That is one full-table read against a table that grows by a few
thousand rows a year — a busy shop cuts about six slabs a day, each leaving two or three
remnants — and it buys one tested implementation of the hardest logic in the product instead of
two that have to agree. If an org ever outgrows it, the fix is a recursive CTE behind those same
two calls.

**Codes come from a counter row, not `max(code)+1`.** `code_counters` is bumped inside the create
transaction, so two people registering a remnant in the same second get different codes. The
browser-only MVP's read-modify-write could not promise that.

**Sessions are opaque tokens, not JWTs.** A JWT cannot be revoked before it expires, which makes
"log out everywhere" and "disable this account" into lies. Only the SHA-256 of the token is
stored, so a database dump does not hand over live sessions. The cost is one primary-key lookup
per request.

**Passwords use scrypt.** PBKDF2 was in the MVP because WebCrypto offers nothing else; on the
server that constraint is gone and scrypt's memory hardness is what actually costs an attacker
with a GPU something. Login derives a hash even when the account does not exist, so "no such
account" is not measurably faster than "wrong password".

**Photos are never a column.** Bytes go to object storage keyed `<orgId>/<pieceId>` — Supabase
Storage when configured, local disk when not, so development and tests need no credentials. Blob
writes happen outside the transaction: a failed upload must not roll back a committed row, and an
orphaned object is recoverable where an undeletable piece is not.

**Backup import accepts the retired four-kind format.** Those exports are the only copy of what
the MVP collected. See `@marble/core` → `migrate.ts`.

## Tests

```bash
createdb marble_test
npm run test --workspace @marble/api
```

They drive the real HTTP app against a real Postgres. There is no in-memory substitute on
purpose: unique constraints, enum columns, `onDelete: Restrict` on the lineage relation and
transaction rollback are a large share of what this layer *is*, and a fake would assert none of
it. `TEST_DATABASE_URL` overrides the target — it is TRUNCATEd between tests, so never point it
at anything you want to keep.

## Deploying

```bash
npm run build:api          # → apps/api/dist/server.js, ~45 kB with @marble/core inlined
npm run db:deploy          # apply migrations to the target database
node apps/api/dist/server.js
```

Set `DATABASE_URL`, `WEB_ORIGIN` (the deployed web origin — it cannot be `*` once cookies are
involved), and the `SUPABASE_*` photo variables. `NODE_ENV=production` switches the session
cookie to `SameSite=None; Secure`, which is what a cross-origin SPA needs.
