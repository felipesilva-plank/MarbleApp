# @marble/mcp-posthog

An MCP server that lets Claude Code check whether the analytics you *think* you added are actually
firing.

## Why

Broken instrumentation is silent. An event that was never added, or was added as `pieceCreated`
next to the `piece_created` everywhere else, looks exactly like a feature nobody uses — and you
find out six weeks later when a funnel is empty and the data is gone.

The loop this exists for:

1. Run the app on localhost.
2. Walk a flow: sign in → create a piece from a parent → save a filter preset.
3. Ask Claude Code: *"check the events for that flow fired."*
4. It calls `check-event-fired` for each expected event and tells you which are missing.
5. Fix the gaps, walk the flow again, confirm.

## Setup

`.env.local` (gitignored):

```bash
POSTHOG_API_KEY=phx_...        # personal API key, read scope — NOT a project write key
POSTHOG_PROJECT_ID=12345       # the number in your PostHog URL
POSTHOG_HOST=https://eu.posthog.com   # optional
```

Then in the app's own `.env.local`:

```bash
VITE_POSTHOG_KEY=phc_...       # project key. VITE_ means it ships in the bundle — that is
VITE_POSTHOG_HOST=https://eu.i.posthog.com   # correct for a write-only project key, and would
                                             # be a disaster for the personal key above.
```

Absent `VITE_POSTHOG_KEY`, the app captures nothing. That is the normal state in dev and tests —
analytics must never be why a feature breaks.

## Tools

| Tool | Answers |
| --- | --- |
| `check-event-fired` | "Did `piece_created` fire in the last 10 minutes?" — yes/no, count, most recent. |
| `get-events` | Recent events with their properties. For inspecting what a flow actually emitted. |
| `get-event-definitions` | Every name PostHog has seen, with volume and observed property keys. Finds drifted names. |
| `coverage` | Diffs the declared catalog against what has fired. |

`coverage` splits its answer three ways on purpose:

- **firing** — declared and arriving.
- **declaredButNeverFired** — un-instrumented flow, a typo, or a genuinely unused feature. Worth
  telling apart, so the tool reports rather than concludes.
- **firedButNotDeclared** — almost always a rename that landed on one side only.

## Notes

- Queries go through PostHog's **HogQL** endpoint rather than the legacy `/api/event/` route, so
  aggregation happens server-side. "Did this fire at all" should not mean pulling 4,000 rows back.
- `fetch` is injected, so the tests run against a stub and stay green with no API key. The
  behaviour worth testing — the query built and the message handed back — is fully exercised either
  way.
- A 401/403 gets a different message from a 500, because they call for different next actions: fix
  the credentials versus retry the query.
- `DECLARED_EVENTS` duplicates `apps/web/src/lib/analytics/events.ts` deliberately. This package
  must be importable in a Node process without dragging in a browser workspace — and since
  `coverage` exists to diff declared against actual, a drift between the two copies surfaces as a
  finding rather than hiding.
