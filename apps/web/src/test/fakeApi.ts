import {
  DomainError,
  applyFilter,
  deriveCounters,
  emptyCounters,
  getChildren,
  isDomainError,
  nextCode,
  normalizeQuery,
  parseBackup,
  recomputeSubtree,
  slugify,
  wouldCreateCycle,
} from '@marble/core'
import type {
  Counters,
  CreatePieceInput,
  FilterPreset,
  Material,
  Org,
  Piece,
  PieceFilter,
  PieceKind,
  RemnantOrigin,
  User,
} from '@marble/core'
import { API_URL } from '../data'

/**
 * An in-memory stand-in for `apps/api`, installed over `globalThis.fetch`.
 *
 * The web tests could have swapped the repository out below the port instead, but then the whole
 * of `data/http` — query building, the multipart photo upload, turning an error body back into a
 * `DomainError` — would never run in a test. Faking the *network* rather than the adapter keeps
 * all of that on the tested path, and it is the same trade the API suite makes by using a real
 * Postgres rather than a fake Prisma.
 *
 * The behaviour it implements comes from `@marble/core`, which is the same code the real server
 * runs, so the two cannot drift on lineage, filtering or code generation. What it deliberately
 * does not model is anything the database owns — constraints, transactions, tenant isolation.
 * Those are asserted in `apps/api/src/api.integration.test.ts` against real Postgres.
 */

interface Store {
  org: Org | null
  user: User | null
  signedIn: boolean
  pieces: Piece[]
  materials: Material[]
  presets: FilterPreset[]
  counters: Counters
  photos: Map<string, { bytes: Uint8Array; contentType: string }>
}

let store: Store
let originalFetch: typeof globalThis.fetch | null = null

const ORG_ID = 'org_test'
const USER_ID = 'user_test'

function emptyStore(): Store {
  return {
    org: null,
    user: null,
    signedIn: false,
    pieces: [],
    materials: [],
    presets: [],
    counters: emptyCounters(),
    photos: new Map(),
  }
}

let nextId = 0
const newId = () => `id_${(nextId += 1)}`

function iso(daysAgo: number): string {
  return new Date(Date.UTC(2026, 6, 1) - daysAgo * 86_400_000).toISOString()
}

interface SeedSpec {
  key: string
  code: string
  kind: PieceKind
  remnantOrigin: RemnantOrigin | null
  parentKey: string | null
  materialKey: string
  lengthMm: number
  widthMm: number
  thicknessMm: number
  location: string
  notes: string
  daysAgo: number
  status?: Piece['status']
}

const MATERIAL_SPECS = [
  { key: 'carrara', name: 'Carrara White', color: 'White with grey veining', finish: 'Polished' },
  { key: 'nero', name: 'Nero Marquina', color: 'Black with white veining', finish: 'Honed' },
  { key: 'verde', name: 'Verde Alpi', color: 'Deep green', finish: 'Polished' },
]

/**
 * A slab worked down over several jobs, one offcut re-cut again, a job that came back, and two
 * remnants nobody logged. Every screen in the app has something real to render against.
 */
const PIECE_SPECS: SeedSpec[] = [
  { key: 'slb1', code: 'SLB-0001', kind: 'slab', remnantOrigin: null, parentKey: null, materialKey: 'carrara',
    lengthMm: 3200, widthMm: 1900, thicknessMm: 20, location: 'Warehouse / Rack 3',
    notes: 'Kitchen job #1042 cut from this.', daysAgo: 60, status: 'partially_used' },
  { key: 'slb2', code: 'SLB-0002', kind: 'slab', remnantOrigin: null, parentKey: null, materialKey: 'nero',
    lengthMm: 3200, widthMm: 1900, thicknessMm: 20, location: 'Warehouse / Rack 4',
    notes: 'Slight edge chip.', daysAgo: 55 },
  { key: 'rmn1', code: 'RMN-0001', kind: 'remnant', remnantOrigin: 'offcut', parentKey: 'slb1', materialKey: 'carrara',
    lengthMm: 1400, widthMm: 700, thicknessMm: 20, location: 'Yard A / Rack 1',
    notes: 'Good for a vanity top.', daysAgo: 40 },
  { key: 'rmn2', code: 'RMN-0002', kind: 'remnant', remnantOrigin: 'offcut', parentKey: 'slb1', materialKey: 'carrara',
    lengthMm: 1200, widthMm: 400, thicknessMm: 20, location: 'Yard A / Rack 1', notes: '', daysAgo: 40 },
  { key: 'rmn3', code: 'RMN-0003', kind: 'remnant', remnantOrigin: 'offcut', parentKey: 'rmn1', materialKey: 'carrara',
    lengthMm: 600, widthMm: 500, thicknessMm: 20, location: 'Yard A / Rack 1',
    notes: 'Cut from the vanity offcut for a windowsill.', daysAgo: 30 },
  { key: 'rmn4', code: 'RMN-0004', kind: 'remnant', remnantOrigin: 'rejected', parentKey: 'slb1', materialKey: 'carrara',
    lengthMm: 1600, widthMm: 650, thicknessMm: 20, location: 'Yard A / Returns',
    notes: 'Job #1042 — sink cutout 30 mm off. Remade; this can still take a smaller top.', daysAgo: 25 },
  // The backlog this app exists to clear.
  { key: 'rmn5', code: 'RMN-0005', kind: 'remnant', remnantOrigin: 'offcut', parentKey: null, materialKey: 'nero',
    lengthMm: 1000, widthMm: 500, thicknessMm: 20, location: 'Yard B / Rack 1',
    notes: 'Found on the rack. Source slab unknown.', daysAgo: 20 },
  { key: 'rmn6', code: 'RMN-0006', kind: 'remnant', remnantOrigin: 'offcut', parentKey: null, materialKey: 'verde',
    lengthMm: 700, widthMm: 700, thicknessMm: 30, location: 'Yard B / Rack 2',
    notes: 'Origin unknown — needs linking.', daysAgo: 18 },
]

function seed(): void {
  const materialIds = new Map<string, string>()
  store.materials = MATERIAL_SPECS.map((spec) => {
    const id = newId()
    materialIds.set(spec.key, id)
    return { id, orgId: ORG_ID, name: spec.name, color: spec.color, finish: spec.finish, notes: '', createdAt: iso(90) }
  })

  const ids = new Map<string, string>()
  for (const spec of PIECE_SPECS) ids.set(spec.key, newId())
  const byKey = new Map(PIECE_SPECS.map((spec) => [spec.key, spec]))

  const lineage = (spec: SeedSpec): { rootId: string; depth: number } => {
    let depth = 0
    let current = spec
    while (current.parentKey) {
      const parent = byKey.get(current.parentKey)
      if (!parent) break
      depth += 1
      current = parent
    }
    return { rootId: ids.get(current.key) as string, depth }
  }

  store.pieces = PIECE_SPECS.map((spec) => {
    const { rootId, depth } = lineage(spec)
    const at = iso(spec.daysAgo)
    return {
      id: ids.get(spec.key) as string,
      orgId: ORG_ID,
      code: spec.code,
      parentId: spec.parentKey ? (ids.get(spec.parentKey) as string) : null,
      rootId,
      depth,
      kind: spec.kind,
      remnantOrigin: spec.remnantOrigin,
      status: spec.status ?? 'available',
      materialId: materialIds.get(spec.materialKey) ?? null,
      lengthMm: spec.lengthMm,
      widthMm: spec.widthMm,
      thicknessMm: spec.thicknessMm,
      location: spec.location,
      hasPhoto: false,
      notes: spec.notes,
      createdAt: at,
      updatedAt: at,
      createdBy: USER_ID,
    }
  })

  store.counters = deriveCounters(store.pieces)
}

// --- responses --------------------------------------------------------------

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const noContent = () => new Response(null, { status: 204 })

const fail = (error: DomainError) =>
  json({ error: { code: error.code, message: error.message } }, error.status)

function requireSignedIn(): void {
  if (!store.signedIn) {
    throw new DomainError('UNAUTHENTICATED', 'Your session has expired. Please sign in again.')
  }
}

function requirePiece(id: string, label = 'piece'): Piece {
  const found = store.pieces.find((p) => p.id === id)
  if (!found) throw new DomainError('NOT_FOUND', `That ${label} no longer exists.`)
  return found
}

function filterFromSearch(search: URLSearchParams): PieceFilter {
  const text = (key: string) => search.get(key) || undefined
  const int = (key: string) => {
    const raw = text(key)
    const value = raw ? Number.parseInt(raw, 10) : Number.NaN
    return Number.isFinite(value) ? value : undefined
  }
  return {
    q: text('q'),
    kind: text('kind') as PieceKind | undefined,
    remnantOrigin: text('remnantOrigin') as RemnantOrigin | undefined,
    status: text('status') as PieceFilter['status'],
    materialId: text('materialId'),
    location: text('location'),
    rootId: text('rootId'),
    parentId: text('parentId'),
    minLengthMm: int('minLengthMm'),
    minWidthMm: int('minWidthMm'),
    thicknessMm: int('thicknessMm'),
    orphansOnly: search.get('orphansOnly') === 'true',
  }
}

function mergeUpdated(updated: Piece[]): void {
  const byId = new Map(updated.map((p) => [p.id, p]))
  store.pieces = store.pieces.map((p) => byId.get(p.id) ?? p)
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method.toUpperCase()
  const body = async <T>(): Promise<T> => (await request.json()) as T

  // --- auth ---
  if (path === '/api/auth/register' && method === 'POST') {
    const input = await body<{ name: string; orgName: string; email: string }>()
    store.org = { id: ORG_ID, name: input.orgName, createdAt: iso(0) }
    store.user = {
      id: USER_ID, orgId: ORG_ID, email: input.email.toLowerCase(),
      name: input.name, role: 'owner', createdAt: iso(0),
    }
    store.signedIn = true
    return json({ user: store.user }, 201)
  }
  if (path === '/api/auth/login' && method === 'POST') {
    if (!store.user) throw new DomainError('BAD_CREDENTIALS', 'Email or password is incorrect.')
    store.signedIn = true
    return json({ user: store.user })
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    store.signedIn = false
    return noContent()
  }
  if (path === '/api/auth/me') return json({ user: store.signedIn ? store.user : null })
  if (path === '/api/auth/me/org') {
    requireSignedIn()
    return json({ org: store.org })
  }

  requireSignedIn()

  // --- pieces ---
  if (path === '/api/pieces/locations') {
    const seen = new Set(store.pieces.map((p) => p.location.trim()).filter(Boolean))
    return json({ locations: [...seen].sort((a, b) => a.localeCompare(b)) })
  }

  if (path === '/api/pieces') {
    if (method === 'GET') {
      const pieces = applyFilter(store.pieces, filterFromSearch(url.searchParams)).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      )
      return json({ pieces })
    }
    if (method === 'POST') {
      const input = await body<CreatePieceInput>()
      const parent = input.parentId ? requirePiece(input.parentId, 'parent piece') : null
      const { code, counters } = nextCode(input.kind, store.counters)
      const id = newId()
      const at = new Date().toISOString()
      const piece: Piece = {
        id, orgId: ORG_ID, code,
        parentId: parent?.id ?? null,
        rootId: parent ? parent.rootId : id,
        depth: parent ? parent.depth + 1 : 0,
        kind: input.kind,
        remnantOrigin: input.remnantOrigin,
        status: input.status,
        materialId: input.materialId,
        lengthMm: input.lengthMm, widthMm: input.widthMm, thicknessMm: input.thicknessMm,
        location: input.location.trim(), hasPhoto: false, notes: input.notes.trim(),
        createdAt: at, updatedAt: at, createdBy: USER_ID,
      }
      store.pieces = [...store.pieces, piece]
      store.counters = counters
      return json({ piece }, 201)
    }
  }

  const pieceMatch = /^\/api\/pieces\/([^/]+)(\/parent|\/photo)?$/.exec(path)
  if (pieceMatch) {
    const [, id, suffix] = pieceMatch

    if (suffix === '/parent' && method === 'PUT') {
      const target = requirePiece(id)
      const { parentId } = await body<{ parentId: string | null }>()
      if (parentId !== null) {
        const parent = requirePiece(parentId, 'parent piece')
        if (wouldCreateCycle(store.pieces, id, parentId)) {
          throw new DomainError(
            'CYCLE',
            parentId === id
              ? `${target.code} cannot be cut from itself.`
              : `${parent.code} was already cut from ${target.code}, so it cannot also be its source.`,
          )
        }
      }
      store.pieces = store.pieces.map((p) =>
        p.id === id ? { ...p, parentId, updatedAt: new Date().toISOString() } : p,
      )
      const recomputed = recomputeSubtree(store.pieces, id)
      mergeUpdated(recomputed)
      return json({ pieces: recomputed })
    }

    if (suffix === '/photo') {
      requirePiece(id)
      if (method === 'GET') {
        const photo = store.photos.get(id)
        if (!photo) throw new DomainError('NOT_FOUND', 'That piece has no photo.')
        return new Response(photo.bytes as unknown as BodyInit, {
          headers: { 'Content-Type': photo.contentType },
        })
      }
      if (method === 'PUT') {
        const form = await request.formData()
        const file = form.get('photo')
        if (!(file instanceof Blob)) {
          throw new DomainError('VALIDATION', 'Attach an image file under the field name "photo".')
        }
        store.photos.set(id, {
          bytes: new Uint8Array(await file.arrayBuffer()),
          contentType: file.type || 'image/jpeg',
        })
        store.pieces = store.pieces.map((p) => (p.id === id ? { ...p, hasPhoto: true } : p))
        return noContent()
      }
      if (method === 'DELETE') {
        store.photos.delete(id)
        store.pieces = store.pieces.map((p) => (p.id === id ? { ...p, hasPhoto: false } : p))
        return noContent()
      }
    }

    if (!suffix && method === 'GET') return json({ piece: requirePiece(id) })

    if (!suffix && method === 'PATCH') {
      const existing = requirePiece(id)
      const { parentId: _ignored, ...patch } = await body<Record<string, unknown>>()
      const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() } as Piece
      if (updated.kind === 'slab') updated.remnantOrigin = null
      store.pieces = store.pieces.map((p) => (p.id === id ? updated : p))
      return json({ piece: updated })
    }

    if (!suffix && method === 'DELETE') {
      const target = requirePiece(id)
      const children = getChildren(store.pieces, id)
      if (children.length > 0 && url.searchParams.get('orphanChildren') !== 'true') {
        throw new DomainError(
          'HAS_CHILDREN',
          `${target.code} has ${children.length} piece${children.length === 1 ? '' : 's'} cut from it. ` +
            'Deleting it would erase their origin.',
        )
      }
      store.pieces = store.pieces
        .filter((p) => p.id !== id)
        .map((p) => (p.parentId === id ? { ...p, parentId: null } : p))
      for (const child of children) mergeUpdated(recomputeSubtree(store.pieces, child.id))
      store.photos.delete(id)
      return noContent()
    }
  }

  // --- materials ---
  if (path === '/api/materials') {
    if (method === 'GET') {
      return json({ materials: [...store.materials].sort((a, b) => a.name.localeCompare(b.name)) })
    }
    if (method === 'POST') {
      const input = await body<Material>()
      const name = input.name.trim()
      if (store.materials.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
        throw new DomainError('DUPLICATE', `A material called "${name}" already exists.`)
      }
      const material: Material = {
        id: newId(), orgId: ORG_ID, name,
        color: input.color?.trim() ?? '', finish: input.finish?.trim() ?? '',
        notes: input.notes?.trim() ?? '', createdAt: new Date().toISOString(),
      }
      store.materials = [...store.materials, material]
      return json({ material }, 201)
    }
  }

  const materialMatch = /^\/api\/materials\/([^/]+)$/.exec(path)
  if (materialMatch) {
    const id = materialMatch[1]
    const existing = store.materials.find((m) => m.id === id)
    if (!existing) throw new DomainError('NOT_FOUND', 'That material no longer exists.')

    if (method === 'GET') return json({ material: existing })
    if (method === 'PATCH') {
      const patch = await body<Partial<Material>>()
      const material = { ...existing, ...patch }
      store.materials = store.materials.map((m) => (m.id === id ? material : m))
      return json({ material })
    }
    if (method === 'DELETE') {
      store.materials = store.materials.filter((m) => m.id !== id)
      store.pieces = store.pieces.map((p) => (p.materialId === id ? { ...p, materialId: null } : p))
      return noContent()
    }
  }

  // --- presets ---
  if (path === '/api/presets') {
    if (method === 'GET') return json({ presets: store.presets })
    if (method === 'POST') {
      const input = await body<{ name: string; query: string }>()
      const query = normalizeQuery(input.query)
      if (!query) throw new DomainError('VALIDATION', 'Set at least one filter before saving.')
      const slug = slugify(input.name)
      if (store.presets.some((p) => p.slug === slug)) {
        throw new DomainError('DUPLICATE', `A preset called "${input.name}" already exists.`)
      }
      const preset: FilterPreset = {
        id: newId(), orgId: ORG_ID, name: input.name, slug, query,
        createdAt: new Date().toISOString(),
      }
      store.presets = [...store.presets, preset]
      return json({ preset }, 201)
    }
  }

  const presetMatch = /^\/api\/presets\/([^/]+)$/.exec(path)
  if (presetMatch && method === 'DELETE') {
    store.presets = store.presets.filter((p) => p.id !== presetMatch[1])
    return noContent()
  }

  // --- backup ---
  if (path === '/api/backup') {
    if (method === 'GET') {
      return json({
        version: 2, exportedAt: new Date().toISOString(),
        pieces: store.pieces, materials: store.materials, counters: store.counters, photos: {},
      })
    }
    if (method === 'POST') {
      const backup = parseBackup(await body<unknown>())
      if (!backup) throw new DomainError('BAD_BACKUP', 'That file is not a MarbleApp export.')
      store.pieces = backup.pieces as Piece[]
      store.materials = backup.materials as Material[]
      store.counters = deriveCounters(backup.pieces)
      return json({ pieces: backup.pieces.length, materials: backup.materials.length })
    }
  }

  return json({ error: { code: 'NOT_FOUND', message: 'No such endpoint.' } }, 404)
}

/**
 * Installs the fake over `fetch` and returns the seeded pieces, which is what a test needs in
 * order to navigate to a specific one.
 */
export function startFakeApi(): { pieces: Piece[]; materials: Material[] } {
  store = emptyStore()
  seed()
  originalFetch ??= globalThis.fetch

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(
      typeof input === 'string' && input.startsWith(API_URL) ? input : String(input),
      init,
    )
    try {
      return await handle(request)
    } catch (error) {
      if (isDomainError(error)) return fail(error)
      throw error
    }
  }) as typeof globalThis.fetch

  return { pieces: store.pieces, materials: store.materials }
}

export function stopFakeApi(): void {
  if (originalFetch) globalThis.fetch = originalFetch
}

/** Marks the fake as signed in without going through the register form. */
export function signInFake(orgName = 'Pedra Viva Stoneworks'): void {
  store.org = { id: ORG_ID, name: orgName, createdAt: iso(0) }
  store.user = {
    id: USER_ID, orgId: ORG_ID, email: 'ana@yard.example',
    name: 'Ana Souza', role: 'owner', createdAt: iso(0),
  }
  store.signedIn = true
}
