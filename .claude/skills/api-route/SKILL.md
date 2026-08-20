---
name: api-route
description: Add a new data operation end-to-end through the port contract - interface signature, local adapter implementation, TanStack Query hook, and integration test. Use when the app needs to read or write something it currently cannot, or when the user types /api-route.
---

# Add a data operation

This app has no HTTP server yet, so "adding an API route" means **adding a method to the port
contract**. `apps/web/src/data/ports.ts` is deliberately shaped like the REST API that will replace
it, so a method added correctly here becomes an endpoint later with no change above the seam.

Read `apps/web/src/data/ports.ts` in full before writing anything. Its header comment is the spec.

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

4. **Implement in `apps/web/src/data/local/<repo>Repo.ts`:**
   - Parse the input through its schema at the top of the method.
   - Throw `DomainError(code, message)` for anything the user can act on. Messages are shown
     verbatim, so write them for a fabricator: "That would make the piece its own ancestor.", not
     "Cycle detected in graph".
   - Lineage changes go through `recomputeSubtree` from `@marble/core`. Never assign `rootId` or
     `depth` by hand.
   - Writes go through `writeJson` from `./db` so quota errors surface as `DomainError('QUOTA')`.

5. **Add the hook** in `apps/web/src/hooks/use<Repo>.ts`:
   - Query → `useQuery` with a key from the existing `pieceKeys` / `materialKeys` object. Add the
     key there, do not inline an array literal.
   - Mutation → `useMutation` with `onSuccess: invalidate`. Invalidate the whole `pieces` tree,
     not one detail key: lineage edits ripple across many rows.

6. **Test in `apps/web/src/data/local/local.integration.test.ts`.** Exercise the real adapter — no
   mocks. Cover the happy path *and* the `DomainError` path; the error branch is what the future
   API will get wrong.

7. **Verify.** `npm run typecheck && npm test`.

## Do not

- Add a method that only one component uses and that could be a `useMemo` over `list()`.
- Return a raw store object. Ports return domain entities, deep-cloned, never live references.
- Skip the schema because "the form already validates it". The form is not the contract.
