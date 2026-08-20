import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { optionalNumber, requireString, ToolError } from './types.js'
import type { Tool, ToolContext } from './types.js'

/**
 * save_note and list_notes.
 *
 * save_note is the only tool here that writes anything, which is why it is the only one flagged
 * `needsConfirmation`. Reads are recoverable; a write to the user's disk is the point at which the
 * loop should stop and ask.
 */

export interface Note {
  id: string
  topic: string
  body: string
  source: string | null
  createdAt: string
}

export async function readNotes(path: string): Promise<Note[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    return Array.isArray(parsed) ? (parsed as Note[]) : []
  } catch (error) {
    // Missing file is the normal first-run case.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    // A corrupt file must NOT be silently replaced - that would discard notes the user still has.
    throw new ToolError(
      `${path} exists but is not valid JSON. Move it aside before saving more notes.`,
    )
  }
}

export async function writeNotes(path: string, notes: Note[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(notes, null, 2)}\n`, 'utf8')
}

export const saveNoteTool: Tool = {
  name: 'save_note',
  description:
    'Save a finding to a local notes file so it survives this conversation. Use it for a fact ' +
    'worth keeping, with the URL it came from. One note per fact - a note containing five ' +
    'findings cannot be cited or corrected individually.',
  needsConfirmation: true,
  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'Short subject line, for grouping. e.g. "kerf loss".' },
      body: { type: 'string', description: 'The finding itself, in a sentence or two.' },
      source: { type: 'string', description: 'URL this came from, if any.' },
    },
    required: ['topic', 'body'],
  },
  async run(input, context: ToolContext) {
    const topic = requireString(input, 'topic', { max: 120 })
    const body = requireString(input, 'body', { max: 4000 })
    const source = typeof input.source === 'string' && input.source.trim() ? input.source.trim() : null

    if (context.confirm) {
      const allowed = await context.confirm('save_note', { topic, body, source })
      if (!allowed) {
        // A refusal is not a failure. Say so plainly, or the model retries the same call.
        return 'The user declined to save that note. Continue without saving; do not ask again for this note.'
      }
    }

    const notes = await readNotes(context.notesPath)
    const note: Note = {
      id: `note_${Date.now().toString(36)}_${notes.length + 1}`,
      topic,
      body,
      source,
      createdAt: new Date().toISOString(),
    }

    await writeNotes(context.notesPath, [...notes, note])
    return `Saved note ${note.id} under "${topic}" (${notes.length + 1} notes total).`
  },
}

export const listNotesTool: Tool = {
  name: 'list_notes',
  description:
    'List previously saved notes, optionally filtered by topic. Check here before searching the ' +
    'web - the answer may already have been found and saved in an earlier session.',
  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'Case-insensitive substring match on the topic.' },
      limit: { type: 'number', description: 'Most recent N. Default 20.' },
    },
    required: [],
  },
  async run(input, context) {
    const limit = optionalNumber(input, 'limit', 20, { min: 1, max: 100 })
    const filter = typeof input.topic === 'string' ? input.topic.toLowerCase() : null

    const notes = await readNotes(context.notesPath)
    const matching = (filter ? notes.filter((n) => n.topic.toLowerCase().includes(filter)) : notes)
      .slice(-limit)
      .reverse()

    if (matching.length === 0) {
      return filter ? `No notes matching "${filter}".` : 'No notes saved yet.'
    }

    return matching
      .map((n) => `[${n.topic}] ${n.body}${n.source ? `\n  source: ${n.source}` : ''}`)
      .join('\n\n')
  },
}
