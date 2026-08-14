# The AI SDLC

What changes when an agent writes most of the code is **not** the steps — ticket, design,
implement, test, review, deploy. It is where the time goes.

| Step | Before | Now |
| --- | --- | --- |
| Understand the ticket | 10 min | 10 min |
| Write the spec | *(skipped, it was in your head)* | **20 min — the expensive part** |
| Implement | 3 hours | 10 min |
| Test | 45 min | included |
| Review | 15 min | **25 min — the other expensive part** |

Implementation stopped being the bottleneck. Everything that used to be amortised across three
hours of typing — deciding the edge cases, noticing the assumption, choosing the shape — now has to
happen explicitly, before and after, because nothing forces you to think it through in the middle
any more.

So the two places a human adds value are **the spec** and **the review**. Everything in this
document exists to make those two cheap and the rest automatic.

## The loop

```
Linear ticket  →  Figma (if visual)  →  spec  →  implement  →  review  →  PR  →  preview  →  merge
     ↑                  ↑                                        ↑
   MCP               MCP                                  /review-trio
```

Target for a practice session: **10 PRs/hour** through the full loop. That is only reachable
because steps 1, 2 and 4 are agent-driven — you are spending your minute on the spec and your two
minutes on the review.

## MCP integrations

Configured in `.mcp.json`, committed so the whole team gets the same servers. Approve them once per
machine on first use.

| Server | Transport | What it removes |
| --- | --- | --- |
| **Linear** | http | Copy-pasting acceptance criteria. The agent reads the ticket, and writes the status back when the PR opens. |
| **GitHub** | http | Shelling out for PR bodies and review comments. Needs `GITHUB_PAT` in your environment — a fine-grained token, repo-scoped, nothing else. |
| **Figma** | sse (local) | Guessing at spacing and colour. Requires the Figma desktop app running with Dev Mode MCP enabled; the port is local, so it is unavailable in CI by design. |

**The Linear MCP is not a substitute for reading the ticket.** It puts the acceptance criteria in
context; deciding whether they are the right criteria is still the job.

### Secrets

`.mcp.json` is committed, so it contains `${GITHUB_PAT}` and never a value. Anything that needs a
literal token belongs in `.claude/settings.local.json`, which is gitignored.

## Where each tool actually helps

**Linear → context.** `Read ticket MAR-42 and list its acceptance criteria` beats pasting, mostly
because the agent also sees the comments — which is usually where the real requirement was
clarified three days after the ticket was written.

**Figma → measurements, not layout.** Ask it for the values (spacing scale, colour tokens, font
sizes) and write the JSX yourself or let the agent write it from those values. Asking for a whole
screen produces a pixel-accurate component that ignores every primitive in `components/ui.tsx`.

**GitHub → the review loop.** Reading review comments back into context and acting on them is
where this pays off; opening the PR was never the slow part.

## Review-driven development

The rhythm is: **write the spec, let the agent implement, review hard, iterate on the spec — not
the code.**

When the output is wrong, the instinct is to fix the code. Resist it for one round and ask *why*
the spec allowed that output. Usually a constraint was implicit. Fixing the spec fixes this
implementation and the next four.

Edit the code directly when:

- The defect is genuinely local — a wrong operator, an off-by-one.
- The spec is right and the agent simply got it wrong.
- You are on the third iteration of the same instruction. At that point the spec is not the
  problem; write it yourself and move on.

### What to look for in generated code

In rough order of how often it is wrong here:

1. **Architecture rules.** Imports crossing the `data/` seam, a `node:` import landing in
   `packages/core`, `rootId`/`depth` assigned literally. `tsc` cannot see any of these.
2. **Edge cases.** Empty list, single-node tree, deleted parent. Agents write the happy path very
   well and stop.
3. **Invented abstractions.** A new helper, a new directory, a new dependency for something the
   codebase already does. Ask what it replaces.
4. **Tests that assert the implementation** rather than the behaviour — mocking the repository in
   an integration test, asserting on class names.

Run `/review-trio` before reading the diff yourself. It costs a minute, it runs three angles in
parallel, and it means your attention goes to the findings rather than to the scan.
