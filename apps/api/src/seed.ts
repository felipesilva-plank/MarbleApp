import type { CreatePieceInput } from '@marble/core'
import { db, disconnect } from './db.ts'
import { register } from './services/auth.ts'
import { createMaterial } from './services/materials.ts'
import { createPiece } from './services/pieces.ts'

/**
 * A demo shop, so a fresh database is something you can click around rather than an empty table.
 *
 * The shape is the actual problem this product addresses: a slab cut down over several jobs, the
 * offcuts it left, a piece that came back from a customer, and two remnants sitting on the rack
 * whose origin nobody wrote down. `npm run db:seed`.
 */

const DEMO_EMAIL = 'demo@marbleapp.dev'
const DEMO_PASSWORD = 'stoneyard2026'

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
}

async function main(): Promise<void> {
  const existing = await db().user.findUnique({ where: { email: DEMO_EMAIL } })
  if (existing) {
    console.log(`[seed] ${DEMO_EMAIL} already exists — nothing to do.`) // pre-deploy:allow-console
    return
  }

  const { user } = await register({
    name: 'Demo Fabricator',
    orgName: 'Pedra Viva Stoneworks',
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  })
  const orgId = user.orgId

  const carrara = await createMaterial(orgId, {
    name: 'Carrara White',
    color: 'White with grey veining',
    finish: 'Polished',
    notes: '',
  })
  const nero = await createMaterial(orgId, {
    name: 'Nero Marquina',
    color: 'Black with white veining',
    finish: 'Honed',
    notes: '',
  })
  await createMaterial(orgId, {
    name: 'Verde Alpi',
    color: 'Deep green',
    finish: 'Polished',
    notes: '',
  })

  const slab = (materialId: string, overrides: Partial<CreatePieceInput> = {}) =>
    createPiece(orgId, user.id, {
      kind: 'slab',
      remnantOrigin: null,
      status: 'available',
      parentId: null,
      materialId,
      lengthMm: 3200,
      widthMm: 1900,
      thicknessMm: 20,
      location: 'Warehouse / Rack 3',
      notes: '',
      ...overrides,
    })

  const remnant = (
    parentId: string | null,
    materialId: string,
    overrides: Partial<CreatePieceInput> = {},
  ) =>
    createPiece(orgId, user.id, {
      kind: 'remnant',
      remnantOrigin: 'offcut',
      status: 'available',
      parentId,
      materialId,
      lengthMm: 900,
      widthMm: 600,
      thicknessMm: 20,
      location: 'Yard A / Rack 1',
      notes: '',
      ...overrides,
    })

  // A slab most of the way through its life: two jobs cut out of it, three offcuts left.
  const worked = await slab(carrara.id, {
    status: 'partially_used',
    notes: 'Kitchen jobs #1042 and #1078 cut from this.',
  })
  const wideOffcut = await remnant(worked.id, carrara.id, {
    lengthMm: 1400,
    widthMm: 700,
    notes: 'Good for a vanity top.',
  })
  await remnant(worked.id, carrara.id, { lengthMm: 1200, widthMm: 400 })
  await remnant(worked.id, carrara.id, {
    lengthMm: 800,
    widthMm: 800,
    status: 'reserved',
    location: 'Yard A / Rack 2',
    notes: 'Held for job #1102.',
  })

  // An offcut that was itself cut down — lineage is not limited to one level.
  await remnant(wideOffcut.id, carrara.id, {
    lengthMm: 600,
    widthMm: 500,
    notes: 'Cut from the vanity offcut for a windowsill.',
  })

  // A full slab still on the rack.
  await slab(nero.id, { location: 'Warehouse / Rack 4', notes: 'Slight edge chip.' })

  // A finished piece that came back: wrong sink cutout. A replacement went out; this is resaleable.
  await remnant(worked.id, carrara.id, {
    remnantOrigin: 'rejected',
    lengthMm: 1600,
    widthMm: 650,
    location: 'Yard A / Returns',
    notes: 'Job #1042 — sink cutout 30 mm off. Remade; this can still take a smaller top.',
  })

  // The backlog this app exists to clear: real stone on the rack, origin never recorded.
  await remnant(null, nero.id, {
    lengthMm: 1000,
    widthMm: 500,
    location: 'Yard B / Rack 1',
    notes: 'Found on the rack. Source slab unknown.',
  })
  await remnant(null, nero.id, {
    lengthMm: 700,
    widthMm: 700,
    thicknessMm: 30,
    location: 'Yard B / Rack 2',
    notes: 'Origin unknown — needs linking.',
  })

  // Backdated so the dashboard's "added recently" reads like a working shop rather than one
  // frantic afternoon.
  const pieces = await db().piece.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } })
  const ages = [60, 40, 40, 30, 12, 55, 25, 20, 18]
  await Promise.all(
    pieces.map((piece, index) =>
      db().piece.update({
        where: { id: piece.id },
        data: { createdAt: daysAgo(ages[index] ?? 10), updatedAt: daysAgo(ages[index] ?? 10) },
      }),
    ),
  )

  console.log(`[seed] ${pieces.length} pieces for "Pedra Viva Stoneworks"`) // pre-deploy:allow-console
  console.log(`[seed] sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`) // pre-deploy:allow-console
}

main()
  .catch((error) => {
    console.error('[seed] failed', error)
    process.exitCode = 1
  })
  .finally(() => disconnect())
