---
name: api-route
description: Add a new data operation end-to-end - zod schema, API service and route, port signature, HTTP adapter, TanStack Query hook, and integration test. Use when the app needs to read or write something it currently cannot, or when the user types /api-route.
---

# Add a data operation

An operation is a real HTTP endpoint in `apps/api` plus the method on the port that reaches it.
The work runs **server-first**: the rule lives in a service, the route is thin, and the web side
is a transport call.

Read `apps/web/src/data/ports.ts` and `apps/api/src/routes/pieces.ts` before writing anything.
The header comment in `ports.ts` is the spec, and it lists the endpoint for every method.

## Arguments

`$1` — operation name in camelCase (e.g. `bulkUpdateStatus`).
`$2` — the repository it belongs to: `pieces` | `materials` | `auth` | `backup`.

## Steps

1. **Declare the REST shape first.** Before writing TypeScript, decide the endpoint this becomes:

   ```
   bulkUpdateStatus   PATCH /api/pieces/status   { ids, status }
   ```

   Add it to the comment block at the top of `ports.ts`. If you cannot write the endpoint line
   cleanly, the operation is wrong — usually it is two operations, or it belongs in
   `packages/core` as a pure function instead.

2. **Add the signature to the interface** in `ports.ts`:
   - Always `Promise<T>`, even though the local implementation is synchronous.
   - Never take `orgId` or `createdBy` as a parameter — the adapter derives them from the session,
     exactly as the API will derive them from the JWT.
   - Return the full changed entities, not just ids. `assignParent` returns *every* piece whose
     lineage moved; follow that precedent for anything with ripple effects.

3. **Validate in `packages/core/src/schemas.ts`.** Add a zod schema for the input and export the
   inferred type. This same schema object will validate the API request body — do not write
   validation inline in the adapter or duplicate it in a form.

4. **Implement the rule in `apps/api/src/services/<repo>.ts`:**
   - Take `orgId` as the first argument and scope every query by it. Never read an org id from a
     request body — that is a tenant-isolation hole.
   - Parse the input through its schema at the top of the function.
   - Throw `DomainError(code, message)` for anything the user can act on. Messages are shown
     verbatim, so write them for a fabricator: "That would make the piece its own ancestor.", not
     "Cycle detected in graph".
   - Lineage changes go through `recomputeSubtree` from `@marble/core`. Never assign `rootId` or
     `depth` by hand, and never reimplement the walk in SQL.
   - Anything that touches more than one row goes inside `db().$transaction`.

5. **Expose it in `apps/api/src/routes/<repo>.ts`.** Routes are thin: parse the request, call the
   service, shape the response. No business logic in a handler.

6. **Implement the transport in `apps/web/src/data/http/<repo>Repo.ts`.** `apiGet` / `apiSend`
   from `./client`, and nothing else — no rules, no fallbacks, no local recomputation.

7. **Add the hook** in `apps/web/src/hooks/use<Repo>.ts`:
   - Query → `useQuery` with a key from the existing `pieceKeys` / `materialKeys` object. Add the
     key there, do not inline an array literal.
   - Mutation → `useMutation` with `onSuccess: invalidate`. Invalidate the whole `pieces` tree,
     not one detail key: lineage edits ripple across many rows.

8. **Test in `apps/api/src/api.integration.test.ts`.** Drive the real HTTP app against the real
   database — no mocks. Cover the happy path, the `DomainError` path, and the case where another
   shop asks for the same thing. The error branch and the tenant boundary are what get broken.

   If the operation shows up on a screen, teach `apps/web/src/test/fakeApi.ts` to serve it too,
   or the smoke test for that route will 404.

9. **Verify.** `npm run typecheck && npm test`.

## Do not

- Add a method that only one component uses and that could be a `useMemo` over `list()`.
- Put the rule in the HTTP adapter. A rule enforced only in the browser is not enforced.
- Skip the schema because "the form already validates it". The form is not the contract.
