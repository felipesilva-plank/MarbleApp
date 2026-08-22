/**
 * Re-export only. `DomainError` moved to `@marble/core` when the API landed: the server throws
 * it, serialises the code, and the HTTP adapter rebuilds the same class from the response — so
 * both ends have to be looking at one definition.
 *
 * This file stays because every route and hook in the app imports errors from `../data`, and
 * that seam is worth keeping stable.
 */
export {
  DOMAIN_ERROR_STATUS,
  DomainError,
  errorMessage,
  isDomainError,
  isDomainErrorCode,
} from '@marble/core'
export type { DomainErrorCode } from '@marble/core'
