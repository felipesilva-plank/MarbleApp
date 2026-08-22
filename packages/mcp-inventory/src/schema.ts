/**
 * The relational shape MarbleApp's data takes once it stops being JSON in a browser.
 *
 * This is not a convenience for the MCP server - it mirrors the Prisma schema in apps/api, in
 * SQLite dialect. Keeping them the same means a question the agent answers against this snapshot
 * ("how many remnants have no recorded origin?") is answered by the same SQL against production.
 */

export const SCHEMA_SQL = `
CREATE TABLE materials (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '',
  finish      TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE TABLE pieces (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL,
  code          TEXT NOT NULL,
  parent_id     TEXT REFERENCES pieces(id),
  root_id       TEXT NOT NULL,
  depth         INTEGER NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('slab','remnant')),
  /* NOT NULL for a remnant, NULL for a slab. The pairing is a constraint rather than a
     convention because a remnant with no origin is a row nobody can act on later. */
  remnant_origin TEXT CHECK (remnant_origin IN ('offcut','rejected')),
  status        TEXT NOT NULL CHECK (status IN ('available','reserved','partially_used','consumed','scrapped')),
  material_id   TEXT REFERENCES materials(id),
  length_mm     INTEGER NOT NULL,
  width_mm      INTEGER NOT NULL,
  thickness_mm  INTEGER NOT NULL,
  location      TEXT NOT NULL DEFAULT '',
  has_photo     INTEGER NOT NULL DEFAULT 0,
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  created_by    TEXT NOT NULL,
  /* A table-level constraint because it spans two columns: exactly the remnants carry an origin. */
  CHECK ((kind = 'remnant') = (remnant_origin IS NOT NULL))
);

CREATE UNIQUE INDEX pieces_org_code   ON pieces (org_id, code);
CREATE        INDEX pieces_org_root   ON pieces (org_id, root_id);
CREATE        INDEX pieces_org_parent ON pieces (org_id, parent_id);
CREATE        INDEX pieces_org_status ON pieces (org_id, status);
CREATE        INDEX pieces_org_kind   ON pieces (org_id, kind);

CREATE TABLE filter_presets (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  query       TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

/* Area is derived, never stored - the same rule packages/core enforces. A view keeps the
   arithmetic in one place so an agent writing SQL does not reinvent it per query. */
CREATE VIEW piece_areas AS
  SELECT
    p.id,
    p.code,
    p.kind,
    p.remnant_origin,
    p.status,
    ROUND((p.length_mm / 1000.0) * (p.width_mm / 1000.0), 4) AS area_m2
  FROM pieces p;

/* Remnants with no parent: the backlog this whole app exists to shrink. Slabs are excluded on
   purpose - one was bought from a supplier, so having no parent is correct rather than missing. */
CREATE VIEW unlinked_pieces AS
  SELECT * FROM pieces
  WHERE parent_id IS NULL AND kind = 'remnant';
`

/** Column comments, surfaced by describe-table. SQLite has no COMMENT ON. */
export const COLUMN_NOTES: Record<string, Record<string, string>> = {
  pieces: {
    parent_id: 'The piece this one was cut from. NULL means it was bought from a supplier, or its origin was never recorded.',
    kind: "'slab' or 'remnant'. There is no block (that is the quarry's business) and no finished piece (those are delivered to the customer, not racked).",
    remnant_origin: "'offcut' from a cut, or 'rejected' for a job that came back and can still be cut from. NULL for a slab.",
    root_id: 'Topmost ancestor. Equals id when parent_id is NULL. Derived - never set by hand.',
    depth: '0 at the root. Derived alongside root_id.',
    length_mm: 'Integer millimetres. Industry convention; area in m2 is derived, see the piece_areas view.',
    has_photo: '0 or 1. The image itself lives outside the database.',
    status: 'Always user-set. Cutting a child never changes the parent - kerf loss makes consumption advisory.',
  },
  materials: {
    name: 'Unique per org, case-insensitively, enforced in application code rather than by a constraint.',
  },
}
