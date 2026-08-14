# Specs

A spec exists so the agent implements the thing you meant, and so the reviewer knows what "correct"
was supposed to be. It is not a design document and it is not a ticket — it is the smallest amount
of writing that makes the implementation deterministic.

**Rule of thumb: if you can hold the whole change in your head, you do not need a spec file.** Write
it in the prompt. Specs live here when the change spans more than one file, or when you will come
back to it after a day.

## Templates

| Template | Use when |
| --- | --- |
| [`feature.md`](./feature.md) | New user-visible behaviour |
| [`bugfix.md`](./bugfix.md) | Something is wrong and you know it |
| [`refactor.md`](./refactor.md) | Behaviour must not change |

Copy to `docs/specs/<ticket-id>-<slug>.md`, fill it in, then point the agent at the file.

## What makes a spec work

**Acceptance criteria in the form "given / when / then".** Not "the filter should work" — *given a
saved preset named "Thick offcuts", when the user selects it, then the piece list shows only
remnants with thickness 30 mm and the URL contains `?preset=thick-offcuts`.* The second one is
testable; the first is an opinion.

**Explicit constraints, especially the boring ones.** "Do not add a dependency." "Keep this in
`packages/core`." "The existing export format must still parse." Agents follow constraints
reliably — they just cannot guess them.

**Examples over description.** One before/after pair, one sample payload, one wrong output you have
already seen. This is the highest-value-per-word thing in a spec by a wide margin.

**The edge cases you already know.** Empty list, one item, deleted parent, 5,000 rows. Write them
in the spec and they land in the tests. Leave them out and they land in the bug tracker.

## Anti-patterns

| Anti-pattern | Looks like | Costs you |
| --- | --- | --- |
| Vague criteria | "should be fast", "handle errors gracefully" | Nothing to test against; review becomes taste |
| Implicit assumptions | Not saying the piece list is already filtered by org | A correct implementation of the wrong thing |
| Missing edge cases | Only the happy path | The bug report arrives instead |
| Solution disguised as requirement | "add a `presets` key to localStorage" | Forecloses a better shape; you wanted saved presets, not that key |
| Spec longer than the diff | Three pages for a button | Nobody reads it, including you |

## The loop

1. Write the spec.
2. Agent implements.
3. Review against the **spec**, not against what you now think you wanted.
4. Wrong output → ask what in the spec permitted it. Usually a constraint was implicit. Fix the
   spec and re-run.
5. By the third round on the same point, stop. Edit the code directly and note in the PR that the
   spec was unclear, so the next person writing one learns from it.
