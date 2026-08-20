/**
 * Build metadata, injected by vite at build time (see vite.config.ts).
 *
 * The point is being able to ask "which build is this?" from a preview URL. Vercel gives every
 * branch its own preview, so without the commit sha in the UI there is no way to tell a stale tab
 * from a current one - and this app keeps its data in the browser, so people leave tabs open.
 *
 * `declare const` rather than an import: these are literal replacements, not modules. Values are
 * defensive because `vite dev` and vitest both run without the define step.
 */

declare const __APP_VERSION__: string | undefined
declare const __BUILD_COMMIT__: string | undefined
declare const __BUILD_TIME__: string | undefined

export interface BuildInfo {
  version: string
  /** Short sha, or 'dev' when built outside CI. */
  commit: string
  /** ISO timestamp, or null when unknown. */
  builtAt: string | null
}

function read(value: string | undefined, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

export function buildInfo(): BuildInfo {
  const builtAt = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : ''
  return {
    version: read(typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : undefined, '0.0.0'),
    commit: read(typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : undefined, 'dev'),
    builtAt: builtAt.length > 0 ? builtAt : null,
  }
}
