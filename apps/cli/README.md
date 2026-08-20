# @marble/cli

A CLI chatbot over the Anthropic API. The point is having every knob exposed and every cost
visible, so the trade-offs stop being abstract.

```bash
export ANTHROPIC_API_KEY=sk-ant-...     # or put it in .env.local
npm run chat
npm run chat -- --model haiku --temperature 0 "summarise the piece lineage rules"
```

## Flags

| Flag | Default |
| --- | --- |
| `-m, --model <opus\|sonnet\|haiku\|id>` | `sonnet` |
| `-t, --temperature <0-1>` | `1` |
| `--max-tokens <n>` | `4096` |
| `-s, --system <text>` | a terse-assistant prompt |
| `-h, --help` | — |

Trailing words are sent as a first message; the REPL continues from there.

## Commands

| Command | Does |
| --- | --- |
| `/model [alias\|id]` | List models with pricing and what each is for, or switch. History carries over. |
| `/temp [0-1]` | Show or set. Says what 0 and 0.9+ are actually for. |
| `/max-tokens [n]` | Show or set the response cap. |
| `/system [text\|reset\|none]` | Show, replace, restore, or remove. |
| `/cost` | Tokens and spend, broken down per model. |
| `/clear` | Forget the conversation, keep the settings. |
| `/help`, `/exit` | — |

Ctrl-C cancels a streaming reply without killing the session. Ctrl-D exits.

## Notes worth knowing

**Cost is per model, not per session.** A session that escalates from Haiku to Opus has no single
price, so `/cost` reports each separately and totals them. Cache reads and writes are priced
distinctly (0.1x and 1.25x input) — folding them into plain input makes caching look free, and then
nobody notices when it stops working.

**Pricing is hardcoded**, so `/cost` works offline and the numbers are reviewable in a diff. It is
therefore stale-able: `/cost` prints the date the rates were last checked instead of presenting
them as current, and an unknown model id gets zero pricing with the total labelled a floor.

**Retries are narrated.** The SDK's own retries are configured off (`maxRetries: 0`) because a
silent 45-second pause reads as a hang. `retry-after` is honoured when the API sends it, full
jitter otherwise, and a 4xx fails immediately — five backoffs cannot fix a bad request. Retry
notices go to stderr, so piping stdout to a file keeps only the reply.

**A failed turn is rolled back.** Leaving a user message with no assistant reply would make the
next request two user turns in a row, which the API rejects — one network blip would otherwise
poison the whole session.

**`/system` applies retroactively.** The API sends `system` with every request, so changing it
reframes the existing history too. The command says so, because that surprises people.

## Testing

95 tests, no API key and no network. The SDK is injected, so what gets tested is the request built,
the usage accumulated, the cost computed and the state each command leaves behind. The REPL itself
holds only readline and byte-writing, which is why it has no unit tests — it is exercised by piping
commands through it.
