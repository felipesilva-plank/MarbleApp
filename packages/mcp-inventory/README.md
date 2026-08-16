# @marble/mcp-inventory

An MCP server that lets Claude Code run SQL against a snapshot of the MarbleApp inventory.

## Why

Half the questions that come up mid-feature are questions about the data, not the code. *How deep
does lineage actually get?* *What fraction of remnants have no recorded origin?* *Is anyone
actually using thickness as a filter?* Guessing at those is how you ship a tree view that falls
over at depth 6, or spend a day on a screen nobody needed.

Answering them used to mean stopping to write a throwaway script. Now the agent asks the database
while it works.

## Setup

The app stores data in the browser, so the snapshot comes from a backup export.

1. In the app: **Settings → Export backup**.
2. Build the snapshot:

```bash
npm run seed --workspace @marble/mcp-inventory -- ~/Downloads/marbleapp-backup-2026-08-16.json
```

That writes `packages/mcp-inventory/marble.db`, which is gitignored. `.mcp.json` already points at
it — restart Claude Code and the tools appear.

**Re-seed whenever you want current data.** The snapshot is a read model and never updates itself;
a stale one that looks current is worse than none.

## Tools

| Tool | Does |
| --- | --- |
| `query` | Runs one read-only `SELECT`. Returns JSON, at most 500 rows, and says so when truncated. |
| `schema` | Every `CREATE TABLE` / `VIEW` / `INDEX` statement. |
| `describe-table` | Columns with types, FKs and domain notes, plus row count, indexes and sample rows. |

Resource `marble://tables` lists every table and view with its row count.

## The schema is the migration target

`src/schema.ts` is the Postgres schema from the README's migration path, in SQLite dialect —
`parent_id` referencing `pieces(id)`, the same four indexes, the same check constraints. A query
that works here works against the real database after `apps/api` lands.

Two views encode domain rules that are easy to get wrong in ad-hoc SQL:

- **`piece_areas`** — area derived from millimetres. Never stored, same as in `packages/core`.
- **`unlinked_pieces`** — parentless *remnants and finished pieces only*. A block or slab with no
  parent came from a quarry or a supplier; counting those as "missing an origin" inflates the
  backlog by roughly the number of blocks you own.

## Read-only, and why it matters

`query` refuses anything but `SELECT` / `WITH`, refuses multiple statements, and strips string
literals and comments before scanning so a piece note containing the word "delete" is not a false
positive.

The snapshot is disposable, so a write here would destroy nothing. The reason to refuse is
behavioural: an agent that finds it can `UPDATE` will start adjusting the data until its answer
comes out, and you will not see it happen. A refusal turns that into an error message.

## Examples

```
Ask: how many remnants have no recorded origin?
  SELECT COUNT(*) FROM unlinked_pieces WHERE kind = 'remnant'

Ask: what is the deepest lineage chain in real data?
  SELECT MAX(depth) FROM pieces

Ask: which material is most of the yard by area?
  SELECT m.name, ROUND(SUM(a.area_m2), 1) AS m2
  FROM piece_areas a JOIN pieces p ON p.id = a.id JOIN materials m ON m.id = p.material_id
  GROUP BY m.name ORDER BY m2 DESC
```

## Notes

- **Node >= 22.5**, for `node:sqlite`. Chosen over `better-sqlite3` so `npm ci` on a clean machine
  cannot fail on a native toolchain.
- Runs through `tsx`, not a build step, so it imports `@marble/core` directly and validates the
  backup with the *same* `backupSchema` the app uses on import. A `dist/` build would eventually
  let those two drift.
- stdout is the protocol channel. Diagnostics go to stderr, and the `node:sqlite`
  `ExperimentalWarning` is silenced so it does not become the first thing a client reads.
