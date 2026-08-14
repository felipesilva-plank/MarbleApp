# <TICKET-ID> — <What is being restructured>

**Status:** draft | ready | done

## The one rule

**Behaviour does not change.** If any user-visible behaviour changes, this is a feature and belongs
in `feature.md`. Mixing the two makes the diff unreviewable, because a reviewer can no longer tell
an intended change from an accidental one.

## Why now

Refactoring for its own sake is how a week disappears. Name the concrete thing this unblocks or the
recurring cost it removes. "It bothers me" is honest but not sufficient.

## Current shape

What is there now, and the specific problem with it. File paths.

## Target shape

What it becomes. File paths, and the new boundaries.

## Safety net

How you will know behaviour did not change. In descending order of trust:

- [ ] Existing tests cover the affected paths — list which
- [ ] Characterisation tests added **before** the refactor to pin current behaviour
- [ ] Smoke suite covers the affected routes
- [ ] Manual check on the preview deploy

If the first two boxes are empty, write the tests first. A refactor without a safety net is a
rewrite with extra steps.

## Sequencing

Refactors want to be split into landable steps. List them; each should be independently mergeable
and leave the app working.

1.
2.

## Out of scope

The adjacent thing you will be tempted to fix while you are in there. Name it, leave it, ticket it.
