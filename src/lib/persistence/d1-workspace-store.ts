import { parseFounderContact } from "../application-workspace";
import { parseWorkspaceState } from "./workspace-service";
import type {
  PersistedWorkspaceDocument,
  StoredWorkspaceRecord,
  WorkspaceStore,
} from "./workspace-store";

const INSERT_WORKSPACE =
  "INSERT INTO workspaces (workspace_id, access_token_hash, document_json, updated_at) VALUES (?, ?, ?, ?)";
const SELECT_WORKSPACE =
  "SELECT workspace_id, access_token_hash, document_json, updated_at FROM workspaces WHERE workspace_id = ? LIMIT 1";
const UPDATE_WORKSPACE =
  "UPDATE workspaces SET access_token_hash = ?, document_json = ?, updated_at = ? WHERE workspace_id = ?";

export interface WorkspaceD1Result {
  success: boolean;
  meta?: {
    changes?: number;
  };
}

export interface WorkspaceD1PreparedStatement {
  bind(...values: unknown[]): WorkspaceD1PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<WorkspaceD1Result>;
}

export interface WorkspaceD1Database {
  prepare(query: string): WorkspaceD1PreparedStatement;
}

export function workspaceStoreFromCloudflareEnv(
  environment: unknown,
): D1WorkspaceStore | null {
  if (
    !environment
    || typeof environment !== "object"
    || Array.isArray(environment)
  ) {
    return null;
  }
  const database = (environment as Record<string, unknown>).WORKSPACE_DB;
  if (
    !database
    || typeof database !== "object"
    || Array.isArray(database)
    || typeof (database as { prepare?: unknown }).prepare !== "function"
  ) {
    return null;
  }
  return new D1WorkspaceStore(database as WorkspaceD1Database);
}

interface WorkspaceD1Row {
  workspace_id: string;
  access_token_hash: string;
  document_json: string;
  updated_at: string;
}

function parseDocument(value: unknown): PersistedWorkspaceDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const document = value as Record<string, unknown>;
  const workspace = parseWorkspaceState(document.workspace);
  const founderContact = parseFounderContact(document.founderContact);
  if (
    document.version !== 1
    || !workspace
    || !founderContact
    || typeof document.updatedAt !== "string"
    || !document.updatedAt
    || !Number.isFinite(Date.parse(document.updatedAt))
  ) {
    return null;
  }
  return {
    version: 1,
    workspace: structuredClone(workspace),
    founderContact: structuredClone(founderContact),
    updatedAt: document.updatedAt,
  };
}

function parseRow(
  row: WorkspaceD1Row,
  workspaceId: string,
): StoredWorkspaceRecord {
  let parsedDocument: unknown;
  try {
    parsedDocument = JSON.parse(row.document_json);
  } catch {
    throw new Error("Workspace record is invalid.");
  }
  const document = parseDocument(parsedDocument);
  if (
    row.workspace_id !== workspaceId
    || !/^[a-f0-9]{64}$/.test(row.access_token_hash)
    || !document
    || row.updated_at !== document.updatedAt
  ) {
    throw new Error("Workspace record is invalid.");
  }
  return {
    workspaceId: row.workspace_id,
    accessTokenHash: row.access_token_hash,
    document,
  };
}

export class D1WorkspaceStore implements WorkspaceStore {
  readonly #database: WorkspaceD1Database;

  constructor(database: WorkspaceD1Database) {
    this.#database = database;
  }

  async create(record: StoredWorkspaceRecord) {
    const result = await this.#database
      .prepare(INSERT_WORKSPACE)
      .bind(
        record.workspaceId,
        record.accessTokenHash,
        JSON.stringify(record.document),
        record.document.updatedAt,
      )
      .run();
    if (!result.success || result.meta?.changes !== 1) {
      throw new Error("Workspace already exists.");
    }
  }

  async get(workspaceId: string) {
    const row = await this.#database
      .prepare(SELECT_WORKSPACE)
      .bind(workspaceId)
      .first<WorkspaceD1Row>();
    return row ? parseRow(row, workspaceId) : null;
  }

  async put(record: StoredWorkspaceRecord) {
    const result = await this.#database
      .prepare(UPDATE_WORKSPACE)
      .bind(
        record.accessTokenHash,
        JSON.stringify(record.document),
        record.document.updatedAt,
        record.workspaceId,
      )
      .run();
    if (!result.success || result.meta?.changes !== 1) {
      throw new Error("Workspace does not exist.");
    }
  }
}
