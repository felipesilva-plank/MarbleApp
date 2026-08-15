# Getting more out of Claude Code

Notes from working this way, not general advice. Everything here is specific enough to be wrong.

## The prompt

**Name files.** "Add saved presets to the piece list" makes the agent search. "In
`apps/web/src/routes/PieceList.tsx`, the filter already lives in the URL — add a preset row above
the filter card that saves and applies the query string" does not. Searching is cheap in tokens and
expensive in wrong guesses.

**Say what the answer looks like.** "Add a port method" versus "add `list`, `create` and `remove`
to a `PresetRepository` in `ports.ts`, implement in `local/presetRepo.ts`, hook in
`hooks/usePresets.ts`" — the second is the same amount of typing and removes every structural
decision you were going to reject anyway.

**State the constraint you have not said out loud.** Agents follow constraints reliably and guess
them badly. "No new dependency." "Keep it in `packages/core`." "The old export format must still
parse." Each of those saved a round trip here.

**Point at the pattern to copy.** "Follow `materialRepo.ts`" beats three paragraphs describing
`materialRepo.ts`.

**Ask for the thing you will check.** If you are going to want tests, say so up front. Asking
afterwards gets tests written to fit the implementation, which is how you end up with a suite that
passes on a broken feature.

## Plan mode

Use it when you do not yet know which files are involved, when the change touches the `data/` seam
or `packages/core`, or when you suspect there are two reasonable designs and you want to choose.

Skip it for anything you could write yourself in ten minutes. Planning a one-line fix costs more
than the fix.

The tell that you should have used it: the agent's first edit is in a file you did not expect.

## Context

Long sessions degrade — not gradually, but at the point where the thing you are discussing has
scrolled past the useful window.

`/compact` when the work is still the same task but the history is mostly noise (failed attempts,
long test output). **Start fresh** when the task changes. A new task in an old session inherits
every wrong assumption from the last one, and those are invisible to you.

Rough signal: if you are about to say "no, forget that, what I actually want is…", start fresh.

`CLAUDE.md` and the folder-level files are re-read after a compact, so anything that must survive
belongs in a file rather than in the conversation. That is most of why they exist.

## Iterating

**Fix the spec, not the code — for one round.** When the output is wrong, the instinct is to patch
it. Ask instead what in the instruction permitted that output; the answer is usually a constraint
you assumed. Fixing that fixes this attempt and the next four.

**Then stop.** By the third round on the same point, the instruction is not the problem. Write it
yourself, and note in the PR what was unclear.

**Reject in one message, not five.** Batch every correction. Iterating one nit at a time is slower
and produces worse results, because each round re-reads a longer, more contradictory history.

## What this codebase gets wrong most often

In frequency order, which is not the order you would guess:

1. **Architecture rules.** An import crossing the `data/` seam; a `node:` import in
   `packages/core`; `rootId`/`depth` set literally. `tsc` catches none of these — which is why they
   are in `CLAUDE.md` and in the correctness reviewer, twice over.
2. **Edge cases.** The happy path arrives complete and correct. Empty list, single-node tree,
   deleted parent — absent unless asked for.
3. **Invented abstractions.** A new helper, directory or dependency for something already here. The
   useful question is always "what does this replace?"
4. **Tests that assert the implementation.** Mocking the repository in an integration test;
   asserting on class names. Both pass forever and catch nothing.

## Small things that pay

- `/review-trio` before reading the diff yourself. Three angles in parallel, one minute, and your
  attention goes to findings instead of scanning.
- Ask for the alternative you did not pick: "what would you have done differently?" The answer is
  occasionally better and always tells you what the agent was unsure about.
- `npm run pre-deploy` before the PR, not after CI fails.
- When something surprises you, put it in `CLAUDE.md`. That is the whole maintenance loop for these
  files — they grow from real surprises, not from a template.
