import type { AnalyticsEventName, AnalyticsEvents } from './events'

/**
 * A ~70-line PostHog capture client instead of posthog-js.
 *
 * posthog-js is ~60 kB gzipped and its value is autocapture, session replay and feature flags -
 * none of which this app uses. What it needs is the typed catalog in events.ts posted to the
 * capture endpoint. Revisit if flags or replay are ever wanted; until then this is the honest
 * trade, and it keeps the view-layer dependency list at six.
 *
 * No key configured -> every capture is a no-op. That is the normal state in dev and in tests, and
 * analytics must never be the reason a feature breaks.
 */

interface Config {
  key: string
  host: string
}

function readConfig(): Config | null {
  const key = import.meta.env?.VITE_POSTHOG_KEY
  if (typeof key !== 'string' || key.length === 0) return null
  const host = import.meta.env?.VITE_POSTHOG_HOST
  return { key, host: typeof host === 'string' && host ? host : 'https://eu.i.posthog.com' }
}

const config = readConfig()

const DISTINCT_ID_KEY = 'marble.v1.analytics.distinct_id'

/**
 * Anonymous and per-browser. Never the user's email: this app has no server, so anything sent here
 * leaves the machine with no way to redact it later.
 */
function distinctId(): string {
  try {
    const existing = localStorage.getItem(DISTINCT_ID_KEY)
    if (existing) return existing
    const fresh = crypto.randomUUID()
    localStorage.setItem(DISTINCT_ID_KEY, fresh)
    return fresh
  } catch {
    return 'anonymous'
  }
}

export function buildPayload<N extends AnalyticsEventName>(
  key: string,
  name: N,
  properties: AnalyticsEvents[N],
  id: string,
  timestamp: string,
) {
  return {
    api_key: key,
    event: name,
    distinct_id: id,
    timestamp,
    properties: {
      ...properties,
      $lib: 'marble-web',
      // No $current_url: a piece detail path contains an id, and ids are inventory data.
    },
  }
}

export function capture<N extends AnalyticsEventName>(
  name: N,
  properties: AnalyticsEvents[N],
): void {
  if (!config) return

  const body = JSON.stringify(
    buildPayload(config.key, name, properties, distinctId(), new Date().toISOString()),
  )
  const url = `${config.host}/i/v0/e/`

  try {
    // sendBeacon survives the page unloading, which matters for the export and delete events -
    // both are often the last thing someone does before closing the tab.
    if (navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }))) return

    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Analytics failing must never surface to a user or break a flow.
    })
  } catch {
    // Same.
  }
}
