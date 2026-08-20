# <TICKET-ID> — <Short description of the wrong behaviour>

**Status:** draft | ready | fixed
**Severity:** data loss | wrong output | cosmetic

## Reproduction

Numbered, from a clean seed. If you cannot write these steps, you cannot verify the fix.

1.
2.
3.

**Expected:**
**Actual:**

## Blast radius

Who is affected and since when. Is any stored data now wrong? If a bad record can already exist in
someone's browser, the fix has two halves — stop producing them, and handle the ones already there.
Say which halves are in scope.

## Root cause

Fill in *after* diagnosis, before implementing. One or two sentences. If this is still empty, do not
start writing the fix — a fix without a root cause is a guess that happens to make the symptom go
away.

## Fix

The change, in one paragraph. Name the file.

## Regression test

The test that fails before the fix and passes after. **Write it first and watch it fail** — a test
written after a fix usually passes for the wrong reason.

- File:
- Case:

## Constraints

- [ ] Fix is minimal — no opportunistic refactor in the same PR
- [ ] Existing behaviour elsewhere unchanged
- [ ] <anything specific>
