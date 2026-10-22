# apps/web/src/data

The seam between the UI and the API. This directory is the only part of the app that knows a
network exists.

## The shape

```
ports.ts     THE CONTRACT — the interfaces every hook, route and component talks to
http/        The only implementation. fetch against apps/api, with the session cookie.
errors.ts    Re-export of DomainError from @marble/core — the API throws it, this rebuilds it
index.ts     adapter selection + re-exports
```

There is one implementation now. The seam still earns its place: it is what made replacing the
browser-only storage layer a change to this directory and nothing above it — not one hook, route
or component was touched.

## Rules

1. **Nothing outside this directory imports from `http/`.** Hooks, routes and components import
   from `../data`. Grep for `data/http` outside here — every hit is a bug.
2. **Every port method returns a `Promise`.** That is why the UI has loading and error states
   everywhere. Do not "simplify" one to return a plain value.
3. **`orgId` and `createdBy` are never parameters.** The server takes both from the session
   cookie. A method that accepted either would be asking the client to assert its own tenancy.
4. **Write the REST line before the TypeScript.** The header comment in `ports.ts` lists every
   endpoint. If an operation cannot be written as one clean line there, it is usually two
   operations — or a pure function that belongs in `packages/core`.
5. **Validate with a schema from `packages/core`.** The server parses the same objects. A form
   validating the same rule separately is a second source of truth waiting to drift.
6. **Never send business logic through here.** Cycle checks, code generation and subtree
   recomputation happen on the server. This layer transports and translates, nothing else.

## Errors

The API answers `{ error: { code, message } }`. `client.ts` turns that back into the same
`DomainError` the server threw, so a component branching on `error.code === 'CYCLE'` behaves
identically whether the failure came from the server or a local guard.

Messages are rendered verbatim, so they are written for a fabricator:

> "That would make the piece its own ancestor." — not "Cycle detected in graph"

A failure that is *not* a `DomainError` — a 500, an unparseable body — becomes one anyway, because
a person is going to read it. Genuine programming mistakes still throw plain `Error` and reach the
console; do not wrap those in a friendly message, that hides them.

`OFFLINE` is the one code the server never sends: `client.ts` raises it when `fetch` rejects,
which means the request never got an answer at all — no network, the API not running, or CORS
refusing it.

## Photos

Bytes on the wire, data URLs in the UI, and the conversion lives in `http/pieceRepo.ts`.

Upload posts `multipart/form-data`: base64 in JSON inflates an image by a third and pushes it
through a JSON parser. Download re-encodes to a data URL rather than an object URL, because an
object URL has to be revoked and a grid of remnant thumbnails is exactly where forgetting to do
that becomes a leak.

Never put a data URL in a record. `hasPhoto: boolean` on the row, bytes in object storage.

## Testing

The web suite fakes `fetch` (`src/test/fakeApi.ts`), not the repository — so everything in this
directory runs during a smoke test instead of being stubbed out. Behaviour the *server* owns
(constraints, transactions, one shop not seeing another's stone) is asserted in
`apps/api/src/api.integration.test.ts` against a real Postgres, not here.
