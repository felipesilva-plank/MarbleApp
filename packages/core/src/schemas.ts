import { z } from 'zod'
import type { PieceKind, PieceStatus } from './types'

/**
 * Validation lives here so the exact same schemas run in the browser today and inside Fastify
 * later. When the API arrives it validates request bodies with these objects unchanged.
 */

export const pieceKindSchema = z.enum(['block', 'slab', 'remnant', 'finished'])
export const pieceStatusSchema = z.enum([
  'available',
  'reserved',
  'partially_used',
  'consumed',
  'scrapped',
])

// Compile-time guard: these must stay in lockstep with the unions in types.ts.
const _kindsMatch: PieceKind = null as unknown as z.infer<typeof pieceKindSchema>
const _statusesMatch: PieceStatus = null as unknown as z.infer<typeof pieceStatusSchema>
void _kindsMatch
void _statusesMatch

/** 20 m is longer than any stone that has ever been quarried; a sanity bound, not a business rule. */
const lengthField = z
  .number({ message: 'Required' })
  .int('Must be a whole number of millimetres')
  .positive('Must be greater than zero')
  .max(20_000, 'Must be 20000 mm or less')

const thicknessField = z
  .number({ message: 'Required' })
  .int('Must be a whole number of millimetres')
  .positive('Must be greater than zero')
  .max(5_000, 'Must be 5000 mm or less')

export const createPieceSchema = z.object({
  kind: pieceKindSchema,
  status: pieceStatusSchema,
  parentId: z.string().nullable(),
  materialId: z.string().nullable(),
  lengthMm: lengthField,
  widthMm: lengthField,
  thicknessMm: thicknessField,
  location: z.string().max(120, 'Keep it under 120 characters'),
  notes: z.string().max(2000, 'Keep it under 2000 characters'),
})

export type CreatePieceInput = z.infer<typeof createPieceSchema>

export const updatePieceSchema = createPieceSchema.partial()
export type UpdatePieceInput = z.infer<typeof updatePieceSchema>

export const materialInputSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120, 'Keep it under 120 characters'),
  color: z.string().max(120, 'Keep it under 120 characters'),
  finish: z.string().max(120, 'Keep it under 120 characters'),
  notes: z.string().max(2000, 'Keep it under 2000 characters'),
})
export type MaterialInput = z.infer<typeof materialInputSchema>

export const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(120),
  email: z.email('Enter a valid email address').max(200),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
})
export type RegisterInput = z.infer<typeof registerSchema>

export const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})
export type LoginInput = z.infer<typeof loginSchema>

// --- persisted record shapes (used to validate imported backups) --------------

export const pieceRecordSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  code: z.string(),
  parentId: z.string().nullable(),
  rootId: z.string(),
  depth: z.number().int().min(0),
  kind: pieceKindSchema,
  status: pieceStatusSchema,
  materialId: z.string().nullable(),
  lengthMm: z.number().int().positive(),
  widthMm: z.number().int().positive(),
  thicknessMm: z.number().int().positive(),
  location: z.string(),
  hasPhoto: z.boolean(),
  notes: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
})

export const materialRecordSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string(),
  color: z.string(),
  finish: z.string(),
  notes: z.string(),
  createdAt: z.string(),
})

export const countersSchema = z.object({
  block: z.number().int().min(0),
  slab: z.number().int().min(0),
  remnant: z.number().int().min(0),
  finished: z.number().int().min(0),
})

export const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  pieces: z.array(pieceRecordSchema),
  materials: z.array(materialRecordSchema),
  counters: countersSchema,
  /** pieceId -> data URL. Absent when the export had no photos. */
  photos: z.record(z.string(), z.string()).optional(),
})

export type Backup = z.infer<typeof backupSchema>
