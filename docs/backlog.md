# Backlog

Mirrors the Linear project (`MAR`). Kept here so the backlog is readable without a Linear session,
and so an agent can pick up a ticket from the repo alone.

Complexity is **S** (one sitting, one PR) or **M** (needs a spec file in `docs/specs/`).
"Figma" means a design reference exists in the Linear ticket.

## Ready

| ID | Title | Cx | Figma | Acceptance criteria |
| --- | --- | --- | --- | --- |
| MAR-11 | Saved filter presets | M | yes | Given a filter, when the user saves it with a name, then it appears in a preset row above the list and applies in one click. Presets survive reload. |
| MAR-12 | Bulk status change | M | yes | Given N pieces selected in the list, when the user picks a status, then all N update in one operation and the list reflects it without a full refetch. |
| MAR-13 | "Cut from this" shortcut | S | yes | Given a piece detail page, when the user clicks "Cut a piece from this", then the new-piece form opens with parent and material prefilled. |
| MAR-14 | Remnant fit search | M | yes | Given a required size in mm, when the user searches, then only pieces that fit — in either orientation — are listed, closest fit first. |
| MAR-15 | Print a rack label | S | no | Given a piece, when the user prints, then a label with code, material, dimensions and a QR link to the detail page fits on 62 mm thermal stock. |
| MAR-16 | Material colour swatches | S | yes | Given a material with a colour, when it appears in a list or badge, then its swatch is shown. Contrast stays AA against both list backgrounds. |
| MAR-17 | Dashboard: unlinked backlog card | S | yes | Given unlinked remnants exist, when the dashboard loads, then a card shows the count and links to the filtered list. Hidden at zero. |
| MAR-18 | Location autocomplete on the form | S | no | Given previously used locations, when the user types in Location, then matching values are suggested. Free text still allowed. |
| MAR-19 | Keyboard shortcuts | S | no | `/` focuses search, `n` opens new piece, `?` opens a shortcut sheet. Never fires while an input has focus. |
| MAR-20 | Piece detail: consumption estimate | S | no | Given a piece with children, when the detail loads, then estimated consumed area, remaining area and a "measured, not exact" caveat are shown. |
| MAR-21 | Empty states with a next action | S | yes | Every list's empty state names what to do next and links to it. No bare "No results". |
| MAR-22 | Export as CSV | S | no | Given the current filter, when the user exports CSV, then the visible columns are written with a UTF-8 BOM so Excel opens accented material names correctly. |
| MAR-23 | Photo lightbox | S | no | Given a piece with a photo, when the user clicks the thumbnail, then a full-size view opens. Escape and backdrop close it, and the object URL is revoked. |
| MAR-24 | Sort the piece list | S | no | Sortable by code, size, created date and depth. Sort persists in the URL. |
| MAR-25 | Duplicate a piece | S | no | Given a piece, when the user duplicates it, then the form opens with everything copied except code, photo and id. |
| MAR-26 | Breadcrumb: collapse deep chains | S | yes | Given depth > 4, when the breadcrumb renders, then middle entries collapse behind a "…" that expands on click. |
| MAR-27 | Warn before leaving a dirty form | S | no | Given unsaved edits, when the user navigates away, then a confirm appears. No warning for an untouched form. |
| MAR-28 | Filter chip row | S | yes | Active filters render as removable chips above the list, with a "Clear all". |

## Unblocked by `apps/api`

| ID | Title | State |
| --- | --- | --- |
| MAR-30 | Real authentication | **Done.** Server-side sessions, scrypt, httpOnly cookie. |
| MAR-31 | Multi-user org with roles | **Partly.** Orgs and an `owner`/`member` role exist and scope every query. What is missing is inviting a second person — there is no way to add a member to a shop today. |
| MAR-32 | Photo upload to object storage | **Done.** Keyed `<orgId>/<pieceId>`; Supabase Storage in production, local disk in development. |
| MAR-33 | Audit log of lineage edits | Startable. `assignParent` already returns every piece that moved, which is the event to record. |

## What the customer feedback says to build next

From the validation round with a fabricator in the US, in the order the interest ran:

| ID | Title | Why |
| --- | --- | --- |
| MAR-34 | Marketplace: list stone to other shops | The item that generated the most interest by a distance. Two nearby cities hold more than ten shops, most of them small, and a subscription that shows them stone they do not own is the argument for paying at all. Needs a per-piece "listed" flag, a cross-org search that respects it, and a contact path — none of which exist. |
| MAR-35 | Subscription and plan gating | Validated range is US$150–300/month against a competitor at US$500. Blocked on something the code cannot fix: US payment collection cannot depend on a single partner (see the KYC note in the validation write-up). |
| MAR-36 | Material → texture/colour reference | The fabricator answered this on video; the list has not been transcribed into `materials` yet. |
| MAR-37 | Fast entry for a day's cutting | A good day is ~6 slabs cut, each leaving 2–3 remnants. That is up to 24 records typed one form at a time. Registering a slab's offcuts in one pass is the difference between the app being used and being abandoned. |

## How to pick one up

```bash
git checkout main && git pull
git checkout -b feat/mar-11-saved-filter-presets
```

**S** — implement straight from the row above. **M** — copy `docs/specs/feature.md` to
`docs/specs/mar-11-saved-filter-presets.md` and fill it in first; the acceptance criteria in this
table are a summary, not a spec.

Then: implement → `npm run pre-deploy` → `/review-trio` → PR → check the preview → merge.
