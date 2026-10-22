import { ZodError } from 'zod'
import { DomainError, isDomainError } from '@marble/core'
import type { Context } from 'hono'

/**
 * The single place a thrown thing becomes a response.
 *
 * The body shape is fixed — `{ error: { code, message, issues? } }` — because the web app's HTTP
 * adapter rebuilds a `DomainError` from exactly those two fields. Change the shape here and
 * every error message in the UI turns into "Something went wrong."
 */
export interface ApiErrorBody {
  error: {
    code: string
    message: string
    /** Field-level detail, present only for a failed schema parse. */
    issues?: { path: string; message: string }[]
  }
}

/** A zod failure is a 400 with the field paths intact, so a form can highlight the right input. */
function fromZod(error: ZodError): { status: number; body: ApiErrorBody } {
  const issues = error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
  return {
    status: 400,
    body: {
      error: {
        code: 'VALIDATION',
        message: issues[0]?.message ?? 'Some of those details are not valid.',
        issues,
      },
    },
  }
}

export function toResponse(error: unknown, c: Context): Response {
  if (error instanceof ZodError) {
    const { status, body } = fromZod(error)
    return c.json(body, status as 400)
  }

  if (isDomainError(error)) {
    return c.json<ApiErrorBody>(
      { error: { code: error.code, message: error.message } },
      error.status as 400,
    )
  }

  // Anything else is a bug. Log it in full, tell the client nothing — a stack trace in a response
  // body is how database structure ends up in someone else's notes.
  console.error('[api] unhandled error', error)
  return c.json<ApiErrorBody>(
    { error: { code: 'INTERNAL', message: 'Something went wrong on our end.' } },
    500,
  )
}

export { DomainError }
