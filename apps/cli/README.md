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
| `/limits [turns] [cost]` | Agent-loop guards: max tool-use turns, max USD per question. |
| `/research <topic>` | The four-step chain below. |
| `/help`, `/exit` | — |

Ctrl-C cancels a streaming reply without killing the session. Ctrl-D exits.

## Tools

`web_search`, `read_url`, `calculator`, `save_note`, `list_notes`. The model calls them in a loop
until it answers; calls within one turn run concurrently.

**The calculator is a parser, not `eval`.** The expression is composed by a model that may be
echoing something off a web page, so `eval` there is arbitrary code execution with extra steps. It
is ~90 lines and the tests assert that `process.exit(1)` and `require("fs")` are *parse errors*.

**Tool errors are written for the model to act on.** "No results for X. Try fewer words, drop any
quotes, or search for a broader term." recovers the turn; "Error: 404" does not.

**`save_note` is the only tool that writes, so it is the only one that asks.** Declining returns a
message telling the model not to ask again — otherwise it retries the same call.

Guards: 15 turns and $1 per question by default, both settable with `/limits`. The cost check runs
*before* each request — finding out you overspent after the fact is a receipt, not a limit.

## `/research <topic>`

A four-step chain rather than the agent loop, because the shape of the work is known up front:

| Step | Model | Does |
| --- | --- | --- |
| 1 | Haiku | Turn the topic into 3 distinct search queries |
| 2 | — | Run them concurrently, dedupe results by URL (no model call) |
| 3 | Sonnet | Read the top N pages, extract only what is relevant |
| 4 | Sonnet | Synthesise a cited markdown report |

Three things the chain buys that an agent loop cannot:

- **Model routing.** Step 1 is decomposition, which Haiku does as well as Sonnet for a fifth of
  the price; step 2 calls no model at all. Be honest about the size of this: the tokens are in
  steps 3–4, so routing step 1 saves a few percent of a run, not most of it. `/research` prints
  the per-step breakdown precisely so the claim stays checkable.
- **Bounded cost.** Exactly three queries, exactly N reads. An agent can decide to search eleven
  more times.
- **Failure isolation.** An unreachable page degrades the report and is *named* in the output; in
  an agent loop it becomes a retry that eats the turn budget.

The trade: it cannot adapt. A topic needing a fifth step does not get one — which is exactly when
the agent loop is the better tool.

Deduping by URL matters more than it looks: a page ranking for two queries would otherwise be read
twice, and reading is the expensive step.

## Notes worth knowing

**Cost is per model, not per session.** A session that escalates from Haiku to Opus has no single
price, so `/cost` reports each separately and totals them. Cache reads and writes are priced
distinctly (0.1x and 1.25x input) — folding them into plain input makes caching look free, and then
nobody notices when it stops working.

**Pricing is hardcoded**, so `/cost` works offline and the numbers are reviewable in a diff. It is
therefore stale-able: `/cost` prints the date the rates were last checked instead of presenting
them as current, and an unknown model id gets zero pricing with the total labelled a floor.

**Retries are narrated** (through `AgentOptions.retry`). The SDK's own retries are configured off (`maxRetries: 0`) because a
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
