/**
 * stdio entrypoint. Registered in .mcp.json; credentials come from the environment, never from
 * the committed config.
 *
 *   POSTHOG_API_KEY      personal key (phx_...), read scope
 *   POSTHOG_PROJECT_ID   numeric id from the PostHog URL
 *   POSTHOG_HOST         optional, defaults to https://eu.posthog.com
 *
 * stdout is the MCP protocol channel; diagnostics go to stderr.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { configFromEnv, PostHogError } from '../posthog.js'
import { createServer } from '../server.js'

let config
try {
  config = configFromEnv()
} catch (error) {
  process.stderr.write(
    `marble-mcp-posthog: ${error instanceof PostHogError ? error.message : String(error)}\n`,
  )
  process.exit(1)
}

await createServer(config).connect(new StdioServerTransport())
process.stderr.write(`marble-mcp-posthog: connected to project ${config.projectId}\n`)
