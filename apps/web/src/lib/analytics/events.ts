/**
 * The event catalog. Every event this app can emit is declared here, with its properties typed.
 *
 * A catalog rather than free-form `capture(name, props)` calls because analytics rots in one
 * specific way: names drift ('piece_created', 'pieceCreated', 'create_piece'), a property gets
 * added at one call site and not the other, and six weeks later no funnel is trustworthy. Typing
 * it makes a rename a compile error and a missing property a compile error.
 *
 * Naming: `object_verb_past_tense`, snake_case. Object first so PostHog's alphabetical event list
 * groups by thing rather than by action.
 */

export interface AnalyticsEvents {
  // --- lineage: the thing this product exists to make possible ---
  piece_created: {
    kind: string
    /**
     * Whether the origin was recorded at creation. The core metric - this whole app is a bet that
     * making lineage easy raises this number.
     */
    has_parent: boolean
    has_photo: boolean
    from_duplicate: boolean
  }
  piece_parent_assigned: {
    /** 'create' when set on the form, 'adopt' when linked afterwards from the detail page. */
    via: 'create' | 'adopt'
    /** Descendants that moved with it. Large values mean reparenting is doing real work. */
    subtree_size: number
  }
  piece_deleted: { kind: string; orphaned_children: number }

  // --- discovery ---
  piece_list_filtered: {
    /** Which filters were active, never their values - values are inventory data. */
    fields: string[]
    result_count: number
  }
  preset_saved: { filter_count: number }
  preset_applied: { filter_count: number }
  piece_searched: { has_results: boolean }

  // --- data safety ---
  backup_exported: { piece_count: number; photo_count: number }
  backup_imported: { piece_count: number }
  pieces_exported_csv: { row_count: number }
  storage_quota_hit: { where: string }
}

export type AnalyticsEventName = keyof AnalyticsEvents

/**
 * The names as data, so the PostHog MCP server can diff what is *declared* here against what has
 * actually *fired* in the last N minutes. That diff is how an un-instrumented flow gets found
 * rather than assumed.
 */
export const ANALYTICS_EVENT_NAMES = [
  'piece_created',
  'piece_parent_assigned',
  'piece_deleted',
  'piece_list_filtered',
  'preset_saved',
  'preset_applied',
  'piece_searched',
  'backup_exported',
  'backup_imported',
  'pieces_exported_csv',
  'storage_quota_hit',
] as const satisfies readonly AnalyticsEventName[]
