import { optionalNumber, requireString, ToolError } from './types.js'
import type { Tool, ToolContext } from './types.js'

/**
 * web_search and read_url.
 *
 * Both take `fetch` from the context rather than the global, so the tests run against a stub and
 * the whole suite stays green with no API key and no network.
 */

const SEARCH_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'

interface BraveResult {
  title?: string
  url?: string
  description?: string
  age?: string
}

export const webSearchTool: Tool = {
  name: 'web_search',
  description:
    'Search the web and return titles, URLs and snippets. Snippets are short - use read_url on a ' +
    'result to get the actual content before relying on it. Prefer several narrow searches over ' +
    'one broad one; each call is cheap.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search terms. Keywords, not a sentence.' },
      count: { type: 'number', description: 'Results to return, 1-10. Default 5.' },
    },
    required: ['query'],
  },
  async run(input, context) {
    const query = requireString(input, 'query', { max: 400 })
    const count = optionalNumber(input, 'count', 5, { min: 1, max: 10 })

    const apiKey = process.env.BRAVE_API_KEY
    if (!apiKey) {
      throw new ToolError(
        'Web search is unavailable: BRAVE_API_KEY is not set. Answer from what you already know ' +
          'and say explicitly that you could not search.',
      )
    }

    const url = `${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}&count=${count}`
    const response = await context.fetch(url, {
      headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
      signal: context.signal,
    })

    if (response.status === 429) {
      throw new ToolError('Search is rate limited right now. Wait before searching again, or use what you have.')
    }
    if (!response.ok) {
      throw new ToolError(`Search failed with HTTP ${response.status}. Try a different query.`)
    }

    const payload = (await response.json()) as { web?: { results?: BraveResult[] } }
    const results = payload.web?.results ?? []

    if (results.length === 0) {
      // Telling it what to do next is the difference between a recovered turn and a wasted one.
      throw new ToolError(
        `No results for "${query}". Try fewer words, drop any quotes, or search for a broader term.`,
      )
    }

    return results
      .slice(0, count)
      .map((result, i) =>
        [
          `${i + 1}. ${result.title ?? '(untitled)'}`,
          `   ${result.url ?? ''}`,
          result.description ? `   ${stripTags(result.description)}` : '',
          result.age ? `   (${result.age})` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n')
  },
}

/** Not a parser. Enough to turn a fetched page into something a model can read cheaply. */
export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Left as-is when out of range: fromCodePoint THROWS a RangeError above 0x10FFFF, which is not
    // a ToolError, so one malformed entity on a page killed the whole read - and research() then
    // recorded the source as unreachable and dropped it.
    .replace(/&#(\d+);/g, (match, code: string) => {
      const point = Number(code)
      return point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match
    })
    .replace(/[ \t]+/g, ' ')
    // Tag removal leaves a space where the tag was, so every line starts with one. Trimming per
    // line rather than only at the ends is worth doing: it is a wasted token on every line of
    // every page fetched.
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, '').trim()
}

const MAX_CHARS = 12_000

export const readUrlTool: Tool = {
  name: 'read_url',
  description:
    'Fetch a web page and return its readable text with markup removed. Use this after web_search ' +
    'to read a result properly - snippets are not enough to cite from. Long pages are truncated, ' +
    'and the result says so when that happens.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Absolute http(s) URL.' },
      maxChars: { type: 'number', description: `Characters to return, up to ${MAX_CHARS}.` },
    },
    required: ['url'],
  },
  async run(input, context) {
    const raw = requireString(input, 'url', { max: 2000 })
    const limit = optionalNumber(input, 'maxChars', MAX_CHARS, { min: 500, max: MAX_CHARS })

    let url: URL
    try {
      url = new URL(raw)
    } catch {
      throw new ToolError(`"${raw}" is not a valid URL. It must start with http:// or https://.`)
    }

    // file: and data: would read the local disk; a search result is not a trustworthy source of
    // a URL to open.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new ToolError(`Only http and https URLs can be read. Got "${url.protocol}".`)
    }

    const response = await context.fetch(url.toString(), {
      headers: { 'User-Agent': 'marble-cli/0.1 (+https://github.com/felipesilva-plank/MarbleApp)' },
      redirect: 'follow',
      signal: context.signal,
    })

    if (!response.ok) {
      throw new ToolError(
        `${url.hostname} returned HTTP ${response.status}. ` +
          `Try a different source rather than retrying this one.`,
      )
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!/text\/|json|xml/.test(contentType)) {
      throw new ToolError(
        `That URL is ${contentType || 'a binary file'}, not readable text. Find an HTML page instead.`,
      )
    }

    const text = htmlToText(await response.text())

    if (text.length === 0) {
      throw new ToolError(
        `${url.hostname} returned a page with no readable text - probably rendered by JavaScript. ` +
          `Try another source.`,
      )
    }

    if (text.length > limit) {
      return `${text.slice(0, limit)}\n\n[truncated at ${limit} of ${text.length} characters]`
    }
    return text
  },
}
