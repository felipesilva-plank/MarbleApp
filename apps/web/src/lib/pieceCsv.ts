import { PIECE_KIND_LABELS, PIECE_STATUS_LABELS, areaM2, isUnlinked } from '@marble/core'
import type { CsvColumn, Material, Piece } from '@marble/core'

/**
 * Columns match what the piece list shows, plus the lineage fields that are the point of this app
 * and are invisible in a screenshot. Codes rather than ids: a spreadsheet is read by a human, and
 * a uuid tells them nothing.
 */
export function pieceCsvColumns(
  materialName: (id: string | null) => string,
  codeOf: (id: string | null) => string,
): CsvColumn<Piece>[] {
  return [
    { header: 'Code', value: (p) => p.code },
    { header: 'Type', value: (p) => PIECE_KIND_LABELS[p.kind] },
    { header: 'Status', value: (p) => PIECE_STATUS_LABELS[p.status] },
    { header: 'Material', value: (p) => materialName(p.materialId) },
    { header: 'Length (mm)', value: (p) => p.lengthMm },
    { header: 'Width (mm)', value: (p) => p.widthMm },
    { header: 'Thickness (mm)', value: (p) => p.thicknessMm },
    { header: 'Area (m2)', value: (p) => areaM2(p).toFixed(3) },
    { header: 'Location', value: (p) => p.location },
    { header: 'Cut from', value: (p) => codeOf(p.parentId) },
    { header: 'Origin recorded', value: (p) => (isUnlinked(p) ? 'no' : 'yes') },
    { header: 'Depth', value: (p) => p.depth },
    { header: 'Notes', value: (p) => p.notes },
    { header: 'Created', value: (p) => p.createdAt },
  ]
}

/**
 * `allPieces` is deliberately the unfiltered set, not the rows being exported: a piece's parent is
 * very often outside the current filter, and printing a blank "Cut from" for it would lose exactly
 * the information this app exists to record. A blank is then unambiguous - it means the parent was
 * deleted.
 */
export function pieceCsvLookups(allPieces: readonly Piece[], materials: readonly Material[]) {
  const materialsById = new Map(materials.map((m) => [m.id, m]))
  const codesById = new Map(allPieces.map((p) => [p.id, p.code]))
  return {
    materialName: (id: string | null) => (id ? (materialsById.get(id)?.name ?? '') : ''),
    codeOf: (id: string | null) => (id ? (codesById.get(id) ?? '') : ''),
  }
}
