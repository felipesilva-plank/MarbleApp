/**
 * The error vocabulary shared by the API and the web app.
 *
 * It lives in core because both ends have to agree on it: the API throws a `DomainError`, maps
 * the code onto an HTTP status and puts the code in the response body; the web app reads that
 * code back and re-throws the same class. A UI branching on `error.code === 'CYCLE'` therefore
 * works identically whether the failure came from the server or from a local guard.
 */
export type DomainErrorCode =
  | 'CYCLE'
  | 'VALIDATION'
  | 'HAS_CHILDREN'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'DUPLICATE'
  | 'BAD_CREDENTIALS'
  | 'QUOTA'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'BAD_BACKUP'
  | 'OFFLINE'

/** The HTTP status each code answers with. The choice of code is therefore an API decision. */
export const DOMAIN_ERROR_STATUS: Record<DomainErrorCode, number> = {
  VALIDATION: 400,
  BAD_BACKUP: 400,
  BAD_CREDENTIALS: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CYCLE: 409,
  HAS_CHILDREN: 409,
  DUPLICATE: 409,
  EMAIL_TAKEN: 409,
  QUOTA: 413,
  // Never sent by the server — the client raises it when the request never left the browser.
  OFFLINE: 503,
}

export function isDomainErrorCode(value: unknown): value is DomainErrorCode {
  return typeof value === 'string' && value in DOMAIN_ERROR_STATUS
}

/**
 * A failure the user can understand and act on, as opposed to a bug.
 *
 * The choice of code matters as much as the message: VALIDATION is a 400 and DUPLICATE is a 409,
 * and labelling a bad input as a conflict would have the API telling clients to retry something
 * that can never succeed.
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode

  constructor(code: DomainErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
    this.code = code
  }

  get status(): number {
    return DOMAIN_ERROR_STATUS[this.code]
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
