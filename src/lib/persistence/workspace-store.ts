import type { FounderContact } from "../application-workspace";
import type { WorkspaceStateV3 } from "../workspace-state";

export interface PersistedWorkspaceDocument {
  version: 1;
  workspace: WorkspaceStateV3;
  founderContact: FounderContact;
  updatedAt: string;
}

export interface StoredWorkspaceRecord {
  workspaceId: string;
  accessTokenHash: string;
  document: PersistedWorkspaceDocument;
}

export interface WorkspaceStore {
  create(record: StoredWorkspaceRecord): Promise<void>;
  get(workspaceId: string): Promise<StoredWorkspaceRecord | null>;
  put(record: StoredWorkspaceRecord): Promise<void>;
}

export class MemoryWorkspaceStore implements WorkspaceStore {
  readonly #records = new Map<string, StoredWorkspaceRecord>();

  async create(record: StoredWorkspaceRecord) {
    if (this.#records.has(record.workspaceId)) {
      throw new Error("Workspace already exists.");
    }
    this.#records.set(record.workspaceId, structuredClone(record));
  }

  async get(workspaceId: string) {
    const record = this.#records.get(workspaceId);
    return record ? structuredClone(record) : null;
  }

  async put(record: StoredWorkspaceRecord) {
    if (!this.#records.has(record.workspaceId)) {
      throw new Error("Workspace does not exist.");
    }
    this.#records.set(record.workspaceId, structuredClone(record));
  }
}
