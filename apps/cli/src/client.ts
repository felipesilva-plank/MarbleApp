import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { addUsage, costUsd, EMPTY_USAGE, resolveModel } from './models.js'
import type { ModelSpec, Usage } from './models.js'
import { withRetry } from './retry.js'
import type { RetryOptions } from './retry.js'

/**
 * A thin layer over the SDK that keeps two things the SDK deliberately does not: a running usage
 * total across the session, and one call shape for streaming and non-streaming.
 *
 * Cost is tracked from the first request rather than added later, because a session's spend is
 * invisible until someone chooses to look, and by then the interesting question ("which turn cost
 * that?") is unanswerable.
 */

export interface AskOptions {
  system?: string
  temperature?: number
  maxTokens?: number
  stopSequences?: string[]
  model?: string
  /** Called per text delta. Its presence is what selects streaming. */
  onText?: (delta: string) => void
  retry?: RetryOptions
  signal?: AbortSignal
}

export interface AskResult {
  text: string
  usage: Usage
  costUsd: number
  model: ModelSpec
  stopReason: string | null
}

export interface ClientOptions {
  apiKey?: string
  defaultModel?: string
  /** Injected in tests. Anything with a `messages` surface the calls below use. */
  anthropic?: Pick<Anthropic, 'messages'>
}

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      'ANTHROPIC_API_KEY is not set. Put it in .env.local (gitignored) or export it:\n' +
        '  export ANTHROPIC_API_KEY=sk-ant-...',
    )
  }
}

export class MarbleClient {
  private readonly anthropic: Pick<Anthropic, 'messages'>
  private readonly defaultModel: string

  /** Session totals, per model - a session that switches models has no single price. */
  private readonly totals = new Map<string, Usage>()

  constructor(options: ClientOptions = {}) {
    this.defaultModel = options.defaultModel ?? 'sonnet'

    if (options.anthropic) {
      this.anthropic = options.anthropic
    } else {
      const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY
      if (!apiKey) throw new MissingApiKeyError()
      // maxRetries 0: retries are handled by withRetry so they can be narrated to the user.
      this.anthropic = new Anthropic({ apiKey, maxRetries: 0 })
    }
  }

  async ask(messages: MessageParam[], options: AskOptions = {}): Promise<AskResult> {
    const spec = resolveModel(options.model ?? this.defaultModel)

    const request = {
      model: spec.id,
      max_tokens: options.maxTokens ?? 4096,
      messages,
      ...(options.system ? { system: options.system } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.stopSequences?.length ? { stop_sequences: options.stopSequences } : {}),
    }

    const message = await withRetry(async () => {
      if (!options.onText) {
        return this.anthropic.messages.create(request, { signal: options.signal })
      }

      const stream = this.anthropic.messages.stream(request, { signal: options.signal })
      stream.on('text', options.onText)
      // finalMessage() carries the complete usage block; the deltas do not.
      return stream.finalMessage()
    }, options.retry)

    const usage: Usage = {
      inputTokens: message.usage.input_tokens ?? 0,
      outputTokens: message.usage.output_tokens ?? 0,
      cacheCreationTokens: message.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    }

    this.totals.set(spec.id, addUsage(this.totals.get(spec.id) ?? EMPTY_USAGE, usage))

    // Tool-use blocks are ignored here on purpose; the agent loop in Day 7 handles those.
    const text = message.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('')

    return { text, usage, costUsd: costUsd(spec, usage), model: spec, stopReason: message.stop_reason }
  }

  /** Per-model totals so far, newest model last. */
  sessionUsage(): Array<{ model: ModelSpec; usage: Usage; costUsd: number }> {
    return [...this.totals.entries()].map(([id, usage]) => {
      const spec = resolveModel(id)
      return { model: spec, usage, costUsd: costUsd(spec, usage) }
    })
  }

  sessionCostUsd(): number {
    return this.sessionUsage().reduce((sum, entry) => sum + entry.costUsd, 0)
  }
}
