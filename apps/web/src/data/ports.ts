import type {
  CreatePieceInput,
  LoginInput,
  Material,
  MaterialInput,
  Piece,
  PieceFilter,
  RegisterInput,
  UpdatePieceInput,
  User,
} from '@marble/core'

/**
 * THE MIGRATION SEAM.
 *
 * Everything above this line (hooks, components, routes) talks only to these interfaces.
 * Everything below it (localStorage + IndexedDB today) is replaceable.
 *
 * Deliberately shaped like the REST API that will replace it:
 *
 *   list          GET    /api/pieces?q=&kind=&status=&materialId=&rootId=
 *   get           GET    /api/pieces/:id
 *   create        POST   /api/pieces
 *   update        PATCH  /api/pieces/:id
 *   assignParent  PUT    /api/pieces/:id/parent      { parentId }
 *   remove        DELETE /api/pieces/:id?orphanChildren=true
 *   setPhoto      PUT    /api/pieces/:id/photo       (multipart)
 *
 * Every method is async even though the local implementation is synchronous, so that swapping in
 * `fetch` changes nothing above this file — including loading and error states, which already
 * exist in the UI because the contract was async from day one.
 *
 * `createdBy` / `orgId` are never parameters: the adapter derives them from the current session,
 * exactly as the API will derive them from the JWT.
 */

export interface PieceRepository {
  list(filter?: PieceFilter): Promise<Piece[]>
  get(id: string): Promise<Piece | null>
  create(input: CreatePieceInput): Promise<Piece>
  update(id: string, input: UpdatePieceInput): Promise<Piece>
  /** Returns every piece whose rootId/depth changed, not just the one that moved. */
  assignParent(id: string, parentId: string | null): Promise<Piece[]>
  remove(id: string, opts?: { orphanChildren?: boolean }): Promise<void>
  setPhoto(id: string, dataUrl: string | null): Promise<void>
  /** A data URL today, a CDN URL once photos move to object storage. */
  getPhotoUrl(id: string): Promise<string | null>
  /** Distinct location strings already in use, for the input's autocomplete. */
  knownLocations(): Promise<string[]>
}

export interface MaterialRepository {
  list(): Promise<Material[]>
  get(id: string): Promise<Material | null>
  create(input: MaterialInput): Promise<Material>
  update(id: string, input: Partial<MaterialInput>): Promise<Material>
  remove(id: string): Promise<void>
}

export interface AuthPort {
  register(input: RegisterInput): Promise<User>
  login(input: LoginInput): Promise<User>
  logout(): Promise<void>
  currentUser(): Promise<User | null>
}

export interface BackupPort {
  exportAll(): Promise<string>
  importAll(json: string): Promise<void>
}
