# <TICKET-ID> — <Feature name>

**Status:** draft | ready | implemented
**Complexity:** small | medium
**Figma:** <link, or "none — no visual change">

## Problem

Who is blocked, and on what. One paragraph, written about the fabricator, not the code. If the
problem cannot be stated without naming a component, it is not yet a problem.

## Outcome

The one sentence a user would say afterwards. "I can save the filter I use every morning and get
back to it in one click."

## Acceptance criteria

Given / when / then. Each one must be mechanically checkable.

- [ ] Given …, when …, then …
- [ ] Given …, when …, then …

## Constraints

- [ ] No new runtime dependency (or: name it and say what it replaces)
- [ ] `packages/core` stays framework-free
- [ ] Nothing above `data/` imports from `data/local/`
- [ ] Existing backup export format still parses
- [ ] <anything specific to this change>

## Edge cases

The ones you already know. Each becomes a test.

| Case | Expected |
| --- | --- |
| Empty inventory | |
| Exactly one match | |
| Parent deleted | |
| 2,000 pieces | |

## Out of scope

What a reasonable implementer might add that you do **not** want. This section prevents more rework
than any other.

## Examples

Before / after, a sample payload, or a screenshot. At least one.

## Verification

- [ ] `npm run typecheck && npm test && npm run build`
- [ ] `npm run pre-deploy`
- [ ] New route added to the smoke suite (or n/a)
- [ ] Preview deploy opened in a browser
