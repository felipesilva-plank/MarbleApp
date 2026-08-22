import type {
  CreatePieceInput,
  FilterPreset,
  FilterPresetInput,
  LoginInput,
  Material,
  MaterialInput,
  Org,
  Piece,
  PieceFilter,
  RegisterInput,
  UpdatePieceInput,
  User,
} from '@marble/core'

/**
 * THE CONTRACT.
 *
 * Everything above this line — hooks, components, routes — talks only to these interfaces.
 * Below it is `http/`, which is the REST API in `apps/api` and nothing else.
 *
 * The endpoint each method calls:
 *
 *   list          GET    /api/pieces?q=&kind=&remnantOrigin=&status=&materialId=&rootId=
 *   get           GET    /api/pieces/:id
 *   create        POST   /api/pieces
 *   update        PATCH  /api/pieces/:id
 *   assignParent  PUT    /api/pieces/:id/parent      { parentId }
 *   remove        DELETE /api/pieces/:id?orphanChildren=true
 *   setPhoto      PUT    /api/pieces/:id/photo       (multipart)  ·  DELETE to clear
 *   getPhotoUrl   GET    /api/pieces/:id/photo
 *   knownLocations GET   /api/pieces/locations
 *
 *   materials.*   GET|POST /api/materials · GET|PATCH|DELETE /api/materials/:id
 *   presets.*     GET|POST /api/presets   · DELETE /api/presets/:id
 *   auth.*        POST /api/auth/register|login|logout · GET /api/auth/me · GET /api/auth/me/org
 *   backup.*      GET|POST /api/backup
 *
 * `createdBy` and `orgId` are never parameters. The server takes both from the session, so a
 * client cannot ask for — or write into — another shop's inventory by changing a payload.
 */

export interface PieceRepository {
  list(filter?: PieceFilter): Promise<Piece[]>
  get(id: string): Promise<Piece | null>
  create(input: CreatePieceInput): Promise<Piece>
  update(id: string, input: UpdatePieceInput): Promise<Piece>
  /** Returns every piece whose rootId/depth changed, not just the one that moved. */
  assignParent(id: string, parentId: string | null): Promise<Piece[]>
  remove(id: string, opts?: { orphanChildren?: boolean }): Promise<void>
  /** A data URL in, bytes on the wire. `null` clears it. */
  setPhoto(id: string, dataUrl: string | null): Promise<void>
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

/**
 * Saved filters for the piece list. Stores the query string rather than a parsed filter object —
 * the URL is already the source of truth, and a second representation would be two things to keep
 * in sync plus a migration every time a filter param is added.
 */
export interface PresetRepository {
  list(): Promise<FilterPreset[]>
  create(input: FilterPresetInput): Promise<FilterPreset>
  remove(id: string): Promise<void>
}

export interface AuthPort {
  register(input: RegisterInput): Promise<User>
  login(input: LoginInput): Promise<User>
  logout(): Promise<void>
  currentUser(): Promise<User | null>
  /** The shop the signed-in user belongs to. Null when nobody is signed in. */
  currentOrg(): Promise<Org | null>
}

export interface BackupPort {
  exportAll(): Promise<string>
  /** Returns what was restored — the caller has no other way to know; its cached data is stale. */
  importAll(json: string): Promise<{ pieces: number; materials: number }>
}
