/// <reference types="vite/client" />

/**
 * Only VITE_-prefixed names are inlined into the browser bundle, so anything declared here is
 * PUBLIC by construction. Never put a secret behind this prefix - it ships to every visitor.
 */
interface ImportMetaEnv {
  /** PostHog project API key. Write-only by design, and safe to publish. Absent = analytics off. */
  readonly VITE_POSTHOG_KEY?: string
  /** PostHog ingestion host. Defaults to the EU cloud. */
  readonly VITE_POSTHOG_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
