# `.claude/`

Shared Claude Code configuration. Committed on purpose — the point is that every agent working on
this repo starts from the same rules, not from whatever each person happened to approve locally.

## Files

| Path | Committed? | What it is |
| --- | --- | --- |
| `settings.json` | yes | Team-wide permissions and env. Changing it is a PR. |
| `settings.local.json` | **no** (gitignored) | Your personal overrides. Anything you approve with "always allow" lands here. |
| `../CLAUDE.md` | yes | Project context loaded into every session. |

## Permission model

Three lists, evaluated `deny` → `ask` → `allow`. **`deny` always wins**, which is why
`git push --force` stays blocked even though `git push` is merely `ask`.

**`allow`** — runs without a prompt. Everything here is either read-only or trivially reversible:
typecheck, tests, build, dev server, and the git commands that only touch local state
(`add`, `commit`, `checkout`, `branch`, `stash`, `worktree`). Editing is scoped to the directories
that actually hold source, so an agent cannot quietly rewrite CI config or `package-lock.json`.

**`ask`** — prompts every time. These leave the machine or change shared state: `git push`,
`gh pr merge`, `vercel`, `npm publish`. The prompt is the point; do not "always allow" these.

**`deny`** — never, no prompt offered:

- `git push --force` and `git reset --hard` — the two commands that destroy work irrecoverably.
  Use `--force-with-lease` (which is only `ask`) when rebasing a stacked branch.
- `rm -rf` — no agent needs it. Delete files with the file tools so the diff is reviewable.
- Reading or editing any `.env*` — `.env.local` holds real keys. Agents should never see them, and
  a leaked key in a transcript is a rotation, not an inconvenience.
- `package-lock.json` — regenerate it with `npm install`, never hand-edit.

## Permission modes

`--permission-mode` (or `/permissions` mid-session) changes how the lists above are applied:

| Mode | Behaviour | When |
| --- | --- | --- |
| `default` | Prompts on anything not in `allow`. | Normal work. |
| `acceptEdits` | Auto-accepts file edits; still prompts for `ask` bash. | Long refactors where you'll review the whole diff at the end anyway. |
| `plan` | Read-only. No edits, no writes, no bash side effects. | Exploring an unfamiliar area before deciding what to do. |
| `bypassPermissions` | Skips every check. | Throwaway containers only. Never on a machine with credentials — the `deny` list is what stops an agent reading `.env.local`, and this mode turns it off. |

## Adding a permission

If you find yourself approving the same command repeatedly, add it to `allow` in a PR rather than
to your local overrides — that way everyone stops being prompted for it. If the command leaves the
machine or costs money, it belongs in `ask` instead, no matter how often it comes up.
