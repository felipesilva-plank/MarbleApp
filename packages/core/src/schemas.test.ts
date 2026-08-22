import { describe, expect, it } from 'vitest'
import {
  backupSchema,
  createPieceSchema,
  loginSchema,
  registerSchema,
  updatePieceSchema,
} from './schemas.ts'

const validPiece = {
  kind: 'remnant',
  remnantOrigin: 'offcut',
  status: 'available',
  parentId: null,
  materialId: null,
  lengthMm: 1200,
  widthMm: 600,
  thicknessMm: 20,
  location: 'Yard A',
  notes: '',
}

const validSlab = { ...validPiece, kind: 'slab', remnantOrigin: null }

describe('createPieceSchema', () => {
  it('accepts a well-formed piece', () => {
    expect(createPieceSchema.safeParse(validPiece).success).toBe(true)
  })

  it('rejects NaN dimensions with a usable message', () => {
    // This is exactly what an emptied number input yields via react-hook-form's valueAsNumber,
    // so the message here is what the user actually reads.
    const result = createPieceSchema.safeParse({ ...validPiece, lengthMm: Number.NaN })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === 'lengthMm')
      expect(issue?.message).toBeTruthy()
      expect(issue?.message).not.toContain('NaN')
    }
  })

  it('rejects zero and negative dimensions', () => {
    expect(createPieceSchema.safeParse({ ...validPiece, widthMm: 0 }).success).toBe(false)
    expect(createPieceSchema.safeParse({ ...validPiece, widthMm: -5 }).success).toBe(false)
  })

  it('rejects fractional millimetres', () => {
    expect(createPieceSchema.safeParse({ ...validPiece, lengthMm: 1200.5 }).success).toBe(false)
  })

  it('rejects an unknown kind', () => {
    expect(createPieceSchema.safeParse({ ...validPiece, kind: 'granite' }).success).toBe(false)
  })

  it('rejects the retired kinds outright', () => {
    // A v1 client still posting these must fail loudly rather than write a row nobody can read.
    expect(createPieceSchema.safeParse({ ...validPiece, kind: 'block' }).success).toBe(false)
    expect(createPieceSchema.safeParse({ ...validPiece, kind: 'finished' }).success).toBe(false)
  })

  it('rejects an implausibly large piece', () => {
    expect(createPieceSchema.safeParse({ ...validPiece, lengthMm: 999_999 }).success).toBe(false)
  })
})

describe('remnant origin', () => {
  it('requires an origin on a remnant', () => {
    const result = createPieceSchema.safeParse({ ...validPiece, remnantOrigin: null })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['remnantOrigin'])
    }
  })

  it('accepts both routes a remnant can arrive by', () => {
    expect(createPieceSchema.safeParse({ ...validPiece, remnantOrigin: 'offcut' }).success).toBe(true)
    expect(createPieceSchema.safeParse({ ...validPiece, remnantOrigin: 'rejected' }).success).toBe(true)
  })

  it('requires a slab to state that it has no origin, and refuses one that does', () => {
    const { remnantOrigin: _omitted, ...slabWithoutOrigin } = validSlab
    expect(createPieceSchema.safeParse(slabWithoutOrigin).success).toBe(false)
    expect(createPieceSchema.safeParse(validSlab).success).toBe(true)
    expect(createPieceSchema.safeParse({ ...validSlab, remnantOrigin: 'offcut' }).success).toBe(false)
  })

  it('lets a patch touch one field without restating the kind', () => {
    expect(updatePieceSchema.safeParse({ location: 'Rack 4' }).success).toBe(true)
  })

  it('still demands an origin when a patch turns a slab into a remnant', () => {
    expect(updatePieceSchema.safeParse({ kind: 'remnant' }).success).toBe(false)
    expect(updatePieceSchema.safeParse({ kind: 'remnant', remnantOrigin: 'rejected' }).success).toBe(true)
  })
})

describe('auth schemas', () => {
  const validRegistration = {
    name: 'Ana',
    orgName: 'Pedra Viva',
    email: 'ana@yard.com',
    password: 'stone12345',
  }

  it('rejects a malformed email', () => {
    expect(registerSchema.safeParse({ ...validRegistration, email: 'nope' }).success).toBe(false)
  })

  it('rejects a short password', () => {
    expect(registerSchema.safeParse({ ...validRegistration, password: 'short' }).success).toBe(false)
  })

  it('requires the shop name — registering creates the org', () => {
    expect(registerSchema.safeParse({ ...validRegistration, orgName: '' }).success).toBe(false)
  })

  it('accepts valid credentials', () => {
    expect(registerSchema.safeParse(validRegistration).success).toBe(true)
    expect(loginSchema.safeParse({ email: 'ana@yard.com', password: 'x' }).success).toBe(true)
  })
})

describe('backupSchema', () => {
  const validBackup = {
    version: 2,
    exportedAt: '2026-07-30T00:00:00.000Z',
    pieces: [],
    materials: [],
    counters: { slab: 0, remnant: 0 },
  }

  it('accepts an export with no photos', () => {
    expect(backupSchema.safeParse(validBackup).success).toBe(true)
  })

  it('rejects an unknown version rather than importing it blindly', () => {
    expect(backupSchema.safeParse({ ...validBackup, version: 3 }).success).toBe(false)
  })

  it('does not accept a v1 export directly — that is what parseBackup is for', () => {
    expect(backupSchema.safeParse({ ...validBackup, version: 1 }).success).toBe(false)
  })

  it('rejects a file that is missing counters', () => {
    const { counters: _omitted, ...withoutCounters } = validBackup
    expect(backupSchema.safeParse(withoutCounters).success).toBe(false)
  })
})
