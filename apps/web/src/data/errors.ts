export type DomainErrorCode =
  | 'CYCLE'
  | 'HAS_CHILDREN'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'DUPLICATE'
  | 'BAD_CREDENTIALS'
  | 'QUOTA'
  | 'UNAUTHENTICATED'
  | 'BAD_BACKUP'

/**
 * A failure the user can understand and act on, as opposed to a bug.
 * The future Fastify API maps these one-to-one onto HTTP status codes.
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}

export function errorMessage(error: unknown): string {
  if (isDomainError(error)) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}
