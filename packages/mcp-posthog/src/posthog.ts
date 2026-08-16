/**
 * Thin PostHog Query API client.
 *
 * Everything goes through HogQL rather than the legacy `/api/event/` endpoint: it is the surface
 * PostHog actually maintains, and it means the tools can aggregate server-side instead of pulling
 * rows back and counting them here - which matters when the honest answer is "did this fire at
 * all", not "here are 4,000 events".
 */

export interface PostHogConfig {
  /** Personal API key (phx_...). Read scope is enough; never a project write key. */
  apiKey: string
  projectId: string
  host: string
}

export class PostHogError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): PostHogConfig {
  const apiKey = env.POSTHOG_API_KEY
  const projectId = env.POSTHOG_PROJECT_ID

  const missing = [
    !apiKey && 'POSTHOG_API_KEY',
    !projectId && 'POSTHOG_PROJECT_ID',
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new PostHogError(
      `Missing ${missing.join(' and ')}. Put them in .env.local - a personal API key (phx_...) ` +
        `with read scope, and the numeric project id from the PostHog URL.`,
    )
  }

  return {
    apiKey: apiKey as string,
    projectId: projectId as string,
    host: env.POSTHOG_HOST ?? 'https://eu.posthog.com',
  }
}

export interface HogQLResponse {
  columns: string[]
  results: unknown[][]
}

export type Fetch = typeof fetch

/** Rows as objects. Column order from HogQL is stable but positional access is unreadable. */
export function toObjects(response: HogQLResponse): Record<string, unknown>[] {
  return response.results.map((row) =>
    Object.fromEntries(response.columns.map((column, i) => [column, row[i]])),
  )
}

export async function runHogQL(
  config: PostHogConfig,
  query: string,
  doFetch: Fetch = fetch,
): Promise<Record<string, unknown>[]> {
  const response = await doFetch(`${config.host}/api/projects/${config.projectId}/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    // Distinguish the two failures that mean completely different next actions: bad credentials
    // (stop and fix .env.local) versus a bad query (rewrite it).
    if (response.status === 401 || response.status === 403) {
      throw new PostHogError(
        `PostHog rejected the credentials (${response.status}). Check POSTHOG_API_KEY is a ` +
          `personal key with read scope and POSTHOG_PROJECT_ID matches it.`,
        response.status,
      )
    }
    throw new PostHogError(
      `PostHog returned ${response.status}: ${body.slice(0, 300) || response.statusText}`,
      response.status,
    )
  }

  const payload = (await response.json()) as HogQLResponse
  return toObjects(payload)
}

/** HogQL has no parameter binding on this endpoint, so anything interpolated is quoted here. */
export function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}
