import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { calculatorTool, evaluate, tokenize } from './calculator.js'
import { listNotesTool, readNotes, saveNoteTool } from './notes.js'
import { ALL_TOOLS, executeTool, executeTools, toAnthropicTools, toolRegistry } from './registry.js'
import { ToolError } from './types.js'
import type { Tool, ToolContext } from './types.js'
import { htmlToText, readUrlTool, webSearchTool } from './web.js'

async function tempContext(overrides: Partial<ToolContext> = {}): Promise<ToolContext> {
  const dir = await mkdtemp(join(tmpdir(), 'marble-notes-'))
  return { fetch: globalThis.fetch, notesPath: join(dir, 'notes.json'), ...overrides }
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

// --- calculator --------------------------------------------------------------

describe('evaluate', () => {
  it.each([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['10 / 4', 2.5],
    ['7 % 3', 1],
    ['-5 + 2', -3],
    ['--5', 5],
    ['2 ^ 10', 1024],
    ['sqrt(144)', 12],
    ['round(2.6)', 3],
    ['abs(-7)', 7],
    ['3200 * 1900 / 1000000', 6.08],
    ['1.5e3', 1500],
  ])('evaluates %s', (expression, expected) => {
    expect(evaluate(expression)).toBeCloseTo(expected, 9)
  })

  it('makes ^ right-associative, so 2^3^2 is 512 rather than 64', () => {
    expect(evaluate('2^3^2')).toBe(512)
  })

  it('binds unary minus tighter than +, so -2^2 is -4', () => {
    expect(evaluate('-2^2')).toBe(-4)
  })

  it('knows pi and e', () => {
    expect(evaluate('pi')).toBeCloseTo(Math.PI, 10)
    expect(evaluate('ln(e)')).toBeCloseTo(1, 10)
  })

  it('refuses division by zero rather than returning Infinity', () => {
    expect(() => evaluate('1/0')).toThrow(/Division by zero/)
  })

  it('reports an unbalanced parenthesis', () => {
    expect(() => evaluate('(1 + 2')).toThrow(/Missing "\)"/)
  })

  it('reports trailing junk instead of silently ignoring it', () => {
    expect(() => evaluate('1 + 2 3')).toThrow(/Could not parse the rest/)
  })

  it('names the available functions when given an unknown one', () => {
    expect(() => evaluate('frobnicate(2)')).toThrow(/Available: sqrt/)
  })

  /**
   * The reason this is a parser and not eval(): the expression is composed by a model that may be
   * echoing something a web page said. These must be parse errors, not executions.
   */
  it.each([
    'process.exit(1)',
    'require("fs")',
    '[].constructor',
    'globalThis',
    '1; console.log(2)',
    'a => a',
  ])('refuses to execute %s', (source) => {
    expect(() => evaluate(source)).toThrow(ToolError)
  })

  it('rejects an unknown character with the allowed set', () => {
    expect(() => tokenize('1 $ 2')).toThrow(/Allowed: numbers/)
  })
})

describe('calculatorTool', () => {
  it('echoes the expression alongside the result', async () => {
    const context = await tempContext()
    expect(await calculatorTool.run({ expression: '2 + 2' }, context)).toBe('2 + 2 = 4')
  })

  it('trims floating-point noise', async () => {
    const context = await tempContext()
    expect(await calculatorTool.run({ expression: '0.1 + 0.2' }, context)).toBe('0.1 + 0.2 = 0.3')
  })

  it('requires a non-empty expression', async () => {
    const context = await tempContext()
    await expect(calculatorTool.run({ expression: '  ' }, context)).rejects.toThrow(ToolError)
  })
})

// --- web ---------------------------------------------------------------------

describe('htmlToText', () => {
  it('drops script and style contents entirely', () => {
    expect(htmlToText('<p>keep</p><script>var drop = 1</script><style>.x{}</style>')).toBe('keep')
  })

  it('turns block ends into newlines so paragraphs survive', () => {
    expect(htmlToText('<p>one</p><p>two</p>')).toBe('one\ntwo')
  })

  it('decodes entities, including numeric ones', () => {
    expect(htmlToText('a &amp; b &#8212; c')).toBe('a & b — c')
  })

  it('collapses runs of blank lines', () => {
    expect(htmlToText('<p>a</p><p></p><p></p><p></p><p>b</p>')).toBe('a\n\nb')
  })
})

describe('webSearchTool', () => {
  it('explains what to do when no API key is configured', async () => {
    const previous = process.env.BRAVE_API_KEY
    delete process.env.BRAVE_API_KEY
    try {
      const context = await tempContext()
      await expect(webSearchTool.run({ query: 'marble' }, context)).rejects.toThrow(
        /Answer from what you already know/,
      )
    } finally {
      if (previous !== undefined) process.env.BRAVE_API_KEY = previous
    }
  })

  it('sends the key as a subscription header and formats the results', async () => {
    process.env.BRAVE_API_KEY = 'brave_test'
    const calls: Array<[string, RequestInit | undefined]> = []
    const context = await tempContext({
      fetch: (async (url: string, init?: RequestInit) => {
        calls.push([String(url), init])
        return jsonResponse({
          web: {
            results: [
              { title: 'Kerf loss', url: 'https://example.com/kerf', description: 'About <b>kerf</b>.' },
            ],
          },
        })
      }) as never,
    })

    const output = await webSearchTool.run({ query: 'kerf loss', count: 3 }, context)

    expect(calls[0][0]).toContain('q=kerf%20loss')
    expect(calls[0][0]).toContain('count=3')
    expect((calls[0][1]?.headers as Record<string, string>)['X-Subscription-Token']).toBe('brave_test')
    expect(output).toContain('1. Kerf loss')
    expect(output).toContain('https://example.com/kerf')
    // Snippet markup would otherwise reach the model as literal <b> tags.
    expect(output).toContain('About kerf.')
  })

  it('tells the model how to broaden rather than just saying no results', async () => {
    process.env.BRAVE_API_KEY = 'brave_test'
    const context = await tempContext({ fetch: (async () => jsonResponse({ web: { results: [] } })) as never })
    await expect(webSearchTool.run({ query: 'zzz' }, context)).rejects.toThrow(/Try fewer words/)
  })

  it('distinguishes rate limiting from a generic failure', async () => {
    process.env.BRAVE_API_KEY = 'brave_test'
    const context = await tempContext({
      fetch: (async () => new Response('', { status: 429 })) as never,
    })
    await expect(webSearchTool.run({ query: 'x' }, context)).rejects.toThrow(/rate limited/)
  })
})

describe('readUrlTool', () => {
  it('returns readable text', async () => {
    const context = await tempContext({
      fetch: (async () =>
        new Response('<html><body><h1>Title</h1><p>Body text.</p></body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })) as never,
    })
    expect(await readUrlTool.run({ url: 'https://example.com' }, context)).toContain('Body text.')
  })

  it.each(['file:///etc/passwd', 'data:text/html,<b>x</b>'])('refuses %s', async (url) => {
    const context = await tempContext()
    await expect(readUrlTool.run({ url }, context)).rejects.toThrow(/Only http and https/)
  })

  it('rejects a string that is not a URL at all', async () => {
    const context = await tempContext()
    await expect(readUrlTool.run({ url: 'not a url' }, context)).rejects.toThrow(/not a valid URL/)
  })

  it('says to try another source rather than retrying a 404', async () => {
    const context = await tempContext({
      fetch: (async () => new Response('', { status: 404 })) as never,
    })
    await expect(readUrlTool.run({ url: 'https://example.com/x' }, context)).rejects.toThrow(
      /Try a different source/,
    )
  })

  it('refuses a binary response instead of returning mojibake', async () => {
    const context = await tempContext({
      fetch: (async () =>
        new Response('', { status: 200, headers: { 'Content-Type': 'image/png' } })) as never,
    })
    await expect(readUrlTool.run({ url: 'https://example.com/a.png' }, context)).rejects.toThrow(
      /not readable text/,
    )
  })

  it('says so when it truncates, so a partial page is not mistaken for the whole one', async () => {
    const context = await tempContext({
      fetch: (async () =>
        new Response(`<p>${'word '.repeat(500)}</p>`, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })) as never,
    })
    const output = await readUrlTool.run({ url: 'https://example.com', maxChars: 500 }, context)
    expect(output).toMatch(/\[truncated at 500 of \d+ characters\]/)
  })

  it('suggests another source for a JavaScript-rendered page with no text', async () => {
    const context = await tempContext({
      fetch: (async () =>
        new Response('<html><body><div id="root"></div></body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })) as never,
    })
    await expect(readUrlTool.run({ url: 'https://example.com' }, context)).rejects.toThrow(
      /rendered by JavaScript/,
    )
  })
})

// --- notes -------------------------------------------------------------------

describe('saveNoteTool', () => {
  it('appends a note with its source', async () => {
    const context = await tempContext()
    await saveNoteTool.run({ topic: 'kerf', body: 'Blade width is 3 mm.', source: 'https://x' }, context)

    const notes = await readNotes(context.notesPath)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ topic: 'kerf', source: 'https://x' })
  })

  it('appends rather than replacing', async () => {
    const context = await tempContext()
    await saveNoteTool.run({ topic: 'a', body: 'one' }, context)
    await saveNoteTool.run({ topic: 'b', body: 'two' }, context)
    expect(await readNotes(context.notesPath)).toHaveLength(2)
  })

  it('asks before writing, since this is the only tool that touches the disk', async () => {
    const confirm = vi.fn(async () => true)
    const context = await tempContext({ confirm })
    await saveNoteTool.run({ topic: 'kerf', body: 'x' }, context)

    expect(confirm).toHaveBeenCalledWith('save_note', expect.objectContaining({ topic: 'kerf' }))
  })

  it('writes nothing when declined, and says not to ask again', async () => {
    const context = await tempContext({ confirm: async () => false })
    const output = await saveNoteTool.run({ topic: 'kerf', body: 'x' }, context)

    expect(output).toMatch(/declined/)
    expect(output).toMatch(/do not ask again/)
    expect(await readNotes(context.notesPath)).toHaveLength(0)
  })

  it('refuses to overwrite a corrupt notes file - those are notes the user still has', async () => {
    const context = await tempContext()
    await writeFile(context.notesPath, '{ not json', 'utf8')
    await expect(saveNoteTool.run({ topic: 'a', body: 'b' }, context)).rejects.toThrow(
      /Move it aside/,
    )
    expect(await readFile(context.notesPath, 'utf8')).toBe('{ not json')
  })

  it('is the only tool flagged as needing confirmation', () => {
    expect(ALL_TOOLS.filter((t) => t.needsConfirmation).map((t) => t.name)).toEqual(['save_note'])
  })
})

describe('listNotesTool', () => {
  it('says none rather than returning an empty string', async () => {
    const context = await tempContext()
    expect(await listNotesTool.run({}, context)).toBe('No notes saved yet.')
  })

  it('filters by topic, case-insensitively', async () => {
    const context = await tempContext()
    await saveNoteTool.run({ topic: 'Kerf loss', body: 'one' }, context)
    await saveNoteTool.run({ topic: 'Pricing', body: 'two' }, context)

    expect(await listNotesTool.run({ topic: 'kerf' }, context)).toContain('one')
    expect(await listNotesTool.run({ topic: 'kerf' }, context)).not.toContain('two')
  })

  it('returns the most recent first', async () => {
    const context = await tempContext()
    await saveNoteTool.run({ topic: 'a', body: 'older' }, context)
    await saveNoteTool.run({ topic: 'b', body: 'newer' }, context)

    const output = await listNotesTool.run({}, context)
    expect(output.indexOf('newer')).toBeLessThan(output.indexOf('older'))
  })
})

// --- registry ----------------------------------------------------------------

describe('registry', () => {
  it('exposes every tool to the API with a schema', () => {
    const declared = toAnthropicTools()
    expect(declared).toHaveLength(ALL_TOOLS.length)
    for (const tool of declared) {
      expect(tool.description?.length ?? 0).toBeGreaterThan(40)
      expect(tool.input_schema.type).toBe('object')
    }
  })

  it('turns a thrown ToolError into an is_error result rather than escaping', async () => {
    const context = await tempContext()
    const result = await executeTool(
      { type: 'tool_use', id: 'tu_1', name: 'calculator', input: { expression: '1/0' } },
      toolRegistry(),
      context,
    )

    expect(result.ok).toBe(false)
    expect(result.block.is_error).toBe(true)
    expect(result.block.tool_use_id).toBe('tu_1')
    expect(result.block.content).toMatch(/Division by zero/)
  })

  it('names the real tools when the model invents one', async () => {
    const context = await tempContext()
    const result = await executeTool(
      { type: 'tool_use', id: 'tu_2', name: 'do_the_thing', input: {} },
      toolRegistry(),
      context,
    )

    expect(result.ok).toBe(false)
    expect(result.block.content).toContain('calculator')
  })

  it('contains an unexpected throw instead of leaving the conversation malformed', async () => {
    const exploding: Tool = {
      name: 'boom',
      description: 'x'.repeat(50),
      inputSchema: { type: 'object', properties: {} },
      async run() {
        throw new TypeError('undefined is not a function')
      },
    }
    const context = await tempContext()
    const result = await executeTool(
      { type: 'tool_use', id: 'tu_3', name: 'boom', input: {} },
      toolRegistry([exploding]),
      context,
    )

    expect(result.ok).toBe(false)
    expect(result.block.content).toContain('boom failed unexpectedly')
  })

  it('runs a turn\'s tool calls concurrently, not one after another', async () => {
    const slow: Tool = {
      name: 'slow',
      description: 'x'.repeat(50),
      inputSchema: { type: 'object', properties: {} },
      async run() {
        await new Promise((resolve) => setTimeout(resolve, 60))
        return 'done'
      },
    }
    const context = await tempContext()
    const started = Date.now()

    const results = await executeTools(
      [1, 2, 3].map((n) => ({ type: 'tool_use' as const, id: `tu_${n}`, name: 'slow', input: {} })),
      toolRegistry([slow]),
      context,
    )

    expect(results).toHaveLength(3)
    expect(results.every((r) => r.ok)).toBe(true)
    // Sequential would be ~180ms.
    expect(Date.now() - started).toBeLessThan(150)
  })

  it('keeps result order matching call order, so transcripts read straight', async () => {
    const context = await tempContext()
    const results = await executeTools(
      [
        { type: 'tool_use', id: 'a', name: 'calculator', input: { expression: '1+1' } },
        { type: 'tool_use', id: 'b', name: 'calculator', input: { expression: '2+2' } },
      ],
      toolRegistry(),
      context,
    )
    expect(results.map((r) => r.block.tool_use_id)).toEqual(['a', 'b'])
  })
})

describe('calculator regressions', () => {
  /**
   * The display rounding multiplied by 1e10 before dividing, which overflowed to Infinity for any
   * result above ~1.79e298 - so the tool whose whole purpose is being right about arithmetic
   * returned "Infinity" for a perfectly finite answer.
   */
  it.each(['2^1000', '1e300', '1e299 * 10'])('does not overflow the display rounding for %s', async (expression) => {
    const context = await tempContext()
    const output = await calculatorTool.run({ expression }, context)
    expect(output).not.toContain('Infinity')
    expect(Number(output.split(' = ')[1])).toBeGreaterThan(1e200)
  })

  it('still trims floating-point noise at ordinary magnitudes', async () => {
    const context = await tempContext()
    expect(await calculatorTool.run({ expression: '0.1 + 0.2' }, context)).toBe('0.1 + 0.2 = 0.3')
  })

  it('still refuses a genuinely infinite result', async () => {
    const context = await tempContext()
    await expect(calculatorTool.run({ expression: '1e308 * 10' }, context)).rejects.toThrow(
      /not a finite number/,
    )
  })
})

describe('htmlToText regressions', () => {
  /**
   * String.fromCodePoint throws a RangeError above 0x10FFFF. That is not a ToolError, so one
   * malformed entity killed the entire page read - and research() then recorded the source as
   * unreachable and dropped it from the report.
   */
  it.each(['&#1114112;', '&#99999999;'])('leaves the out-of-range entity %s alone', (entity) => {
    expect(() => htmlToText(`<p>price ${entity} x</p>`)).not.toThrow()
    expect(htmlToText(`<p>price ${entity} x</p>`)).toContain(entity)
  })

  it('still decodes an in-range numeric entity', () => {
    expect(htmlToText('<p>caf&#233;</p>')).toBe('café')
  })

  it('survives a whole page read containing one', async () => {
    const context = await tempContext({
      fetch: (async () =>
        new Response('<p>a &#1114112; b</p>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })) as never,
    })
    await expect(readUrlTool.run({ url: 'https://example.com' }, context)).resolves.toContain('a &#1114112; b')
  })
})
