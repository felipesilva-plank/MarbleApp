# apps/web/src/data

The migration seam. This directory is the only part of the app that knows data lives in a browser.

## The shape

```
ports.ts     THE CONTRACT — async interfaces shaped like the future REST API
local/       localStorage (records) + IndexedDB (photos) implementations
errors.ts    DomainError — user-actionable failures, mapped 1:1 to HTTP codes later
index.ts     adapter selection + re-exports. The ONE file the backend migration edits.
```

## Rules

1. **Nothing outside this directory imports from `local/`.** Hooks, routes and components import
   from `../data`. Grep for `data/local` outside here — every hit is a bug.
2. **Every port method returns a `Promise`**, even where the implementation is synchronous. That is
   why the UI already has loading and error states, and why swapping in `fetch` changes nothing
   above the seam.
3. **`orgId` and `createdBy` are never parameters.** The adapter derives them from the session,
   exactly as the API will derive them from the JWT. A method that takes either is leaking an
   implementation detail that the server will own.
4. **Write the REST line before the TypeScript.** The header comment in `ports.ts` lists every
   endpoint. If an operation cannot be written as one clean line there, it is usually two
   operations — or a pure function that belongs in `packages/core`.
5. **Return domain entities, deep-cloned.** Never a live reference into the store. A caller that
   mutates a returned object must not be able to corrupt what is persisted.
6. **Validate with a schema from `packages/core`.** Parse at the top of the method. The form
   validating the same thing is not a substitute — the form is not the contract.

## Errors

Throw `DomainError(code, message)` for anything a user can act on. The message is rendered
verbatim, so write it for a fabricator:

> "That would make the piece its own ancestor." — not "Cycle detected in graph"

Anything else — a bug, an impossible state — should throw a plain `Error` and reach the console.
Do not wrap a programming mistake in a friendly message; that hides it.

## Storage split

**localStorage** holds records. It caps near 5 MB and throws mid-write when full, so every write
goes through `writeJson` in `local/db.ts`, which converts a quota failure into
`DomainError('QUOTA')` with an instruction the user can follow.

**IndexedDB** holds photos. A dozen photos would exhaust localStorage on their own. Never put a
data URL in a record — `hasPhoto: boolean` on the record, bytes in IndexedDB, and
`photoUrl: string` once object storage exists.

## Testing

`local/local.integration.test.ts` drives the **real** adapters — the block → slab → remnant walk,
auth, cycle rejection, orphan-on-delete, photo storage, backup round trip. Do not mock the
repository in a test whose job is integrating with it.

New adapter behaviour extends that file. Cover the `DomainError` path as well as the happy path:
the error branch is what the future API is most likely to get wrong.
