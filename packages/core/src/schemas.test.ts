import { describe, expect, it } from 'vitest'
import { backupSchema, createPieceSchema, loginSchema, registerSchema } from './schemas'

const validPiece = {
  kind: 'remnant',
  status: 'available',
  parentId: null,
  materialId: null,
  lengthMm: 1200,
  widthMm: 600,
  thicknessMm: 20,
  location: 'Yard A',
  notes: '',
}

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

  it('rejects an implausibly large piece', () => {
    expect(createPieceSchema.safeParse({ ...validPiece, lengthMm: 999_999 }).success).toBe(false)
  })
})

describe('auth schemas', () => {
  it('rejects a malformed email', () => {
    expect(registerSchema.safeParse({ name: 'A', email: 'nope', password: 'longenough' }).success).toBe(false)
  })

  it('rejects a short password', () => {
    expect(registerSchema.safeParse({ name: 'A', email: 'a@b.com', password: 'short' }).success).toBe(false)
  })

  it('accepts valid credentials', () => {
    expect(registerSchema.safeParse({ name: 'Ana', email: 'ana@yard.com', password: 'stone12345' }).success).toBe(true)
    expect(loginSchema.safeParse({ email: 'ana@yard.com', password: 'x' }).success).toBe(true)
  })
})

describe('backupSchema', () => {
  const validBackup = {
    version: 1,
    exportedAt: '2026-07-30T00:00:00.000Z',
    pieces: [],
    materials: [],
    counters: { block: 0, slab: 0, remnant: 0, finished: 0 },
  }

  it('accepts an export with no photos', () => {
    expect(backupSchema.safeParse(validBackup).success).toBe(true)
  })

  it('rejects an unknown version rather than importing it blindly', () => {
    expect(backupSchema.safeParse({ ...validBackup, version: 2 }).success).toBe(false)
  })

  it('rejects a file that is missing counters', () => {
    const { counters: _omitted, ...withoutCounters } = validBackup
    expect(backupSchema.safeParse(withoutCounters).success).toBe(false)
  })
})
