# MAR-11 — Saved filter presets

**Status:** ready
**Complexity:** medium
**Figma:** MarbleApp / Pieces / Preset row

## Problem

The people who use this app filter the same way every morning. A fabricator looking for offcuts
sets kind = remnant, status = available, a thickness, and a minimum size — seven interactions —
then does it again after lunch because the filter reset. The filter already lives in the URL, so
the state is shareable but not *keepable*, and nobody bookmarks an app they are inside all day.

## Outcome

"I saved the filter I use every morning and now it is one click."

## Acceptance criteria

- [ ] Given any active filter, when the user clicks **Save this filter** and types a name, then a
      preset chip with that name appears above the list.
- [ ] Given a saved preset, when the user clicks it, then the URL search params become exactly the
      preset's, and the list updates. No other params (`view`) are disturbed.
- [ ] Given the current filter equals a preset's, when the list renders, then that chip is shown as
      active.
- [ ] Given a preset, when the user deletes it, then it disappears immediately and does not return
      on reload.
- [ ] Given a name already in use, when the user saves, then the save is rejected with
      "A preset called "X" already exists." and nothing is written.
- [ ] Given no filter at all is set, when the user looks at the save control, then it is disabled —
      an empty preset is not useful.
- [ ] Presets survive a reload and are included in the backup export.
- [ ] Given a preset chip, when it renders, then it shows a human summary of what it filters
      ("Remnants · Available · 30 mm") as its title attribute.

## Constraints

- [ ] No new runtime dependency
- [ ] `packages/core` stays framework-free — the preset shape, slug and summary logic go there, and
      must be importable by the future API unchanged
- [ ] Nothing above `data/` imports from `data/local/` — presets get a **port**, like every other
      persisted thing
- [ ] Existing backup files must still import. The new `presets` key is optional in `backupSchema`
- [ ] A preset stores the **query string**, not a parsed filter object. The URL is already the
      source of truth for filter state; parsing it into a second representation creates two things
      to keep in sync

## Edge cases

| Case | Expected |
| --- | --- |
| Preset name is whitespace only | Rejected, same path as empty |
| Name differs only in case ("Thick" vs "thick") | Treated as duplicate |
| Preset saved, then the filter schema gains a param | Old preset still applies; unknown params are simply not read |
| Preset references a material that was since deleted | Applies fine — the filter returns zero rows, which is the honest answer |
| 50 presets | Row scrolls horizontally, does not wrap into a wall |
| Backup from before this feature | Imports; `presets` absent means none |

## Out of scope

- Reordering or pinning presets
- Sharing a preset with another user (there is one user; this arrives with `apps/api`)
- Editing a preset in place — delete and re-save is enough at this size
- Presets for any list other than Pieces

## Examples

Saving with `?kind=remnant&status=available&t=30` and the name `Thick offcuts` stores:

```json
{
  "id": "…",
  "orgId": "org_local",
  "name": "Thick offcuts",
  "slug": "thick-offcuts",
  "query": "kind=remnant&status=available&t=30",
  "createdAt": "2026-08-14T13:20:00.000Z"
}
```

Clicking the chip sets the URL to `/pieces?kind=remnant&status=available&t=30`.

## Verification

- [ ] `npm run typecheck && npm test && npm run build`
- [ ] `npm run pre-deploy`
- [ ] Smoke suite still green (no new route)
- [ ] Preview deploy opened in a browser
