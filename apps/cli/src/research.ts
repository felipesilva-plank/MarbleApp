import type { MarbleClient } from './client.js'
import type { RetryOptions } from './retry.js'
import { addUsage, costUsd, EMPTY_USAGE, resolveModel } from './models.js'
import type { Usage } from './models.js'
import { readUrlTool, webSearchTool } from './tools/web.js'
import { ToolError } from './tools/types.js'
import type { ToolContext } from './tools/types.js'

/**
 * A four-step chain: plan queries → search → read sources → synthesise.
 *
 * Written as a chain rather than handed to the agent loop because the shape of the work is known
 * in advance. That buys three things an agent cannot give you:
 *
 *   - Model routing per step. Step 1 is decomposition, which Haiku does as well as Sonnet at a
 *     fifth of the price. Step 2 calls no model at all. The tokens live in steps 3 and 4 - three
 *     8,000-character extractions and a synthesis - so the routing saves a few percent of a run,
 *     not most of it. The printed per-step breakdown is there so that claim stays checkable rather
 *     than becoming folklore.
 *   - Bounded work. The agent loop can decide to search eleven more times. This does exactly
 *     three queries and reads exactly N pages, so the cost is knowable before you start.
 *   - Failure isolation. One unreachable page degrades the report; in an agent loop it becomes a
 *     retry that eats the turn budget.
 *
 * The trade is that it cannot adapt. If the topic needs a fifth step, it does not get one - which
 * is precisely when the agent loop is the better tool.
 */

export interface ResearchOptions {
  queryCount?: number
  sourceCount?: number
  /** Steps 1 and 2. */
  fastModel?: string
  /** Steps 3 and 4. */
  strongModel?: string
  onStep?: (step: number, description: string) => void
  retry?: RetryOptions
  signal?: AbortSignal
}

export interface Source {
  url: string
  title: string
  /** What step 3 pulled out. Null when the page could not be read. */
  extract: string | null
  error?: string
}

export interface ResearchReport {
  topic: string
  queries: string[]
  sources: Source[]
  report: string
  usage: Usage
  costUsd: number
  /** Per-step spend, which is the whole argument for routing models per step. */
  breakdown: Array<{ step: string; model: string; costUsd: number }>
}

/** Models are cooperative about tags and much less so about bare JSON in a prose reply. */
function extractTagged(text: string, tag: string): string[] {
  return [...text.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))]
    .map((match) => match[1].trim())
    .filter(Boolean)
}

function parseSearchResults(raw: string): Array<{ title: string; url: string }> {
  const results: Array<{ title: string; url: string }> = []
  const lines = raw.split('\n')

  for (let i = 0; i < lines.length; i += 1) {
    const heading = /^\d+\.\s+(.*)$/.exec(lines[i].trim())
    if (!heading) continue
    const url = lines[i + 1]?.trim()
    if (url?.startsWith('http')) results.push({ title: heading[1], url })
  }

  return results
}

export async function research(
  client: MarbleClient,
  topic: string,
  toolContext: ToolContext,
  options: ResearchOptions = {},
): Promise<ResearchReport> {
  const {
    queryCount = 3,
    sourceCount = 3,
    fastModel = 'haiku',
    strongModel = 'sonnet',
    onStep = () => undefined,
    retry,
    signal,
  } = options

  const breakdown: ResearchReport['breakdown'] = []
  let usage = EMPTY_USAGE

  const track = (step: string, model: string, result: { usage: Usage; costUsd: number }) => {
    usage = addUsage(usage, result.usage)
    breakdown.push({ step, model, costUsd: result.costUsd })
  }

  // --- Step 1: turn one topic into several specific queries (Haiku) --------------------------
  onStep(1, `Planning ${queryCount} search queries`)

  const planning = await client.ask(
    [
      {
        role: 'user',
        content:
          `Topic: ${topic}\n\n` +
          `Write ${queryCount} web search queries that together cover this topic from different ` +
          `angles. Keywords, not questions. Each must be specific enough to return different ` +
          `results from the others - three rephrasings of the same query waste two searches.\n\n` +
          `Output each one in <query></query> tags and nothing else.`,
      },
    ],
    {
      model: fastModel,
      // Deterministic: this is decomposition, not writing. Variation here only makes the run
      // irreproducible.
      temperature: 0,
      maxTokens: 400,
      signal,
      retry,
    },
  )
  track('plan queries', resolveModel(fastModel).alias, planning)

  const queries = extractTagged(planning.text, 'query').slice(0, queryCount)
  if (queries.length === 0) {
    throw new ToolError(
      `Could not turn "${topic}" into search queries. Try a more specific topic.`,
    )
  }

  // --- Step 2: run the searches ---------------------------------------------------------------
  onStep(2, `Searching: ${queries.join(' · ')}`)

  // Concurrent: three sequential searches is three round trips for no reason.
  const searchResults = await Promise.all(
    queries.map(async (query) => {
      try {
        return parseSearchResults(await webSearchTool.run({ query, count: 5 }, toolContext))
      } catch {
        // One dead query should not sink the run.
        return []
      }
    }),
  )

  // Dedupe by URL, keeping the first occurrence: a page that ranks for two different queries is
  // one source, not two, and reading it twice doubles the cost of the most expensive step.
  const seen = new Set<string>()
  const candidates: Array<{ title: string; url: string }> = []
  for (const batch of searchResults) {
    for (const result of batch) {
      if (seen.has(result.url)) continue
      seen.add(result.url)
      candidates.push(result)
    }
  }

  if (candidates.length === 0) {
    throw new ToolError(
      `No search results for any of: ${queries.join(', ')}. ` +
        `Either the topic is too narrow, or BRAVE_API_KEY is not set.`,
    )
  }

  // --- Step 3: read the top sources and extract what matters (Sonnet) --------------------------
  const chosen = candidates.slice(0, sourceCount)
  onStep(3, `Reading ${chosen.length} source${chosen.length === 1 ? '' : 's'}`)

  const sources: Source[] = await Promise.all(
    chosen.map(async ({ url, title }): Promise<Source> => {
      let page: string
      try {
        page = await readUrlTool.run({ url, maxChars: 8000 }, toolContext)
      } catch (error) {
        // Recorded rather than dropped: the report should say a source was unreachable instead of
        // quietly resting on two sources while claiming three.
        return { url, title, extract: null, error: error instanceof Error ? error.message : String(error) }
      }

      const extraction = await client.ask(
        [
          {
            role: 'user',
            content:
              `Topic: ${topic}\n\nPage: ${title} (${url})\n\n---\n${page}\n---\n\n` +
              `Pull out only what is relevant to the topic. Facts, figures and direct claims. ` +
              `Keep numbers and units exactly as written. If the page says nothing relevant, ` +
              `reply with exactly NOTHING RELEVANT.`,
          },
        ],
        { model: strongModel, temperature: 0, maxTokens: 1200, signal, retry },
      )
      track(`read ${new URL(url).hostname}`, resolveModel(strongModel).alias, extraction)

      const extract = extraction.text.trim()
      return {
        url,
        title,
        extract: extract === 'NOTHING RELEVANT' || extract.length === 0 ? null : extract,
      }
    }),
  )

  const usable = sources.filter((s) => s.extract !== null)
  if (usable.length === 0) {
    throw new ToolError(
      `Read ${sources.length} pages and none had anything relevant to "${topic}". ` +
        `Try rephrasing the topic.`,
    )
  }

  // --- Step 4: synthesise (Sonnet) ------------------------------------------------------------
  onStep(4, 'Writing the report')

  const synthesis = await client.ask(
    [
      {
        role: 'user',
        content:
          `Topic: ${topic}\n\n` +
          `Findings from ${usable.length} source${usable.length === 1 ? '' : 's'}:\n\n` +
          usable
            .map((source, i) => `[${i + 1}] ${source.title}\n${source.url}\n\n${source.extract}`)
            .join('\n\n---\n\n') +
          `\n\nWrite a short structured report on the topic using ONLY these findings.\n` +
          `- Markdown, with section headings.\n` +
          `- Cite every claim as [1], [2] and so on, matching the numbers above.\n` +
          `- Where sources disagree, say so and cite both. Do not average them.\n` +
          `- Do not add anything not in the findings. If they do not answer part of the topic, ` +
          `say what is missing under a "Not covered" heading.\n` +
          `- End with a Sources list of the numbered URLs.`,
      },
    ],
    // Slight warmth here only: this step is writing, unlike the three before it.
    { model: strongModel, temperature: 0.3, maxTokens: 2000, signal, retry },
  )
  track('synthesise', resolveModel(strongModel).alias, synthesis)

  return {
    topic,
    queries,
    sources,
    report: synthesis.text.trim(),
    usage,
    costUsd: breakdown.reduce((sum, entry) => sum + entry.costUsd, 0),
    breakdown,
  }
}

export { costUsd, extractTagged, parseSearchResults }
