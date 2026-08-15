import assert from "node:assert/strict";
import test from "node:test";
import {
  D1WorkspaceStore,
  type WorkspaceD1Database,
  type WorkspaceD1PreparedStatement,
  type WorkspaceD1Result,
} from "../src/lib/persistence/d1-workspace-store";
import type {
  PersistedWorkspaceDocument,
  StoredWorkspaceRecord,
} from "../src/lib/persistence/workspace-store";

interface FakeRow {
  workspace_id: string;
  access_token_hash: string;
  document_json: string;
  updated_at: string;
}

class FakePreparedStatement implements WorkspaceD1PreparedStatement {
  readonly #database: FakeD1Database;
  readonly #query: string;
  #values: unknown[] = [];

  constructor(database: FakeD1Database, query: string) {
    this.#database = database;
    this.#query = query;
  }

  bind(...values: unknown[]) {
    this.#values = values;
    return this;
  }

  async first<T>() {
    if (!this.#query.startsWith("SELECT ")) {
      throw new Error("Unexpected first query.");
    }
    const workspaceId = String(this.#values[0]);
    return (this.#database.rows.get(workspaceId) ?? null) as T | null;
  }

  async run(): Promise<WorkspaceD1Result> {
    if (this.#query.startsWith("INSERT ")) {
      const [workspaceId, accessTokenHash, documentJson, updatedAt] =
        this.#values.map(String);
      if (this.#database.rows.has(workspaceId)) {
        return { success: false, meta: { changes: 0 } };
      }
      this.#database.rows.set(workspaceId, {
        workspace_id: workspaceId,
        access_token_hash: accessTokenHash,
        document_json: documentJson,
        updated_at: updatedAt,
      });
      return { success: true, meta: { changes: 1 } };
    }
    if (this.#query.startsWith("UPDATE ")) {
      const [accessTokenHash, documentJson, updatedAt, workspaceId] =
        this.#values.map(String);
      if (!this.#database.rows.has(workspaceId)) {
        return { success: true, meta: { changes: 0 } };
      }
      this.#database.rows.set(workspaceId, {
        workspace_id: workspaceId,
        access_token_hash: accessTokenHash,
        document_json: documentJson,
        updated_at: updatedAt,
      });
      return { success: true, meta: { changes: 1 } };
    }
    throw new Error("Unexpected run query.");
  }
}

class FakeD1Database implements WorkspaceD1Database {
  readonly rows = new Map<string, FakeRow>();
  readonly queries: string[] = [];

  prepare(query: string) {
    this.queries.push(query);
    return new FakePreparedStatement(this, query);
  }
}

function document(completed: boolean): PersistedWorkspaceDocument {
  return {
    version: 1,
    workspace: {
      version: 3,
      selectedOpportunityId: "grants-359666",
      savedOpportunityIds: ["grants-359666"],
      savedOpportunityStateByOpportunityId: {},
      checklistByOpportunity: {
        "grants-359666": {
          eligibility: completed,
        },
      },
    },
    founderContact: {
      name: "Ada Founder",
      role: "CEO",
      email: "ada@example.com",
    },
    updatedAt: completed
      ? "2026-08-15T01:00:00.000Z"
      : "2026-08-15T00:00:00.000Z",
  };
}

function record(completed = false): StoredWorkspaceRecord {
  return {
    workspaceId: "workspace-1",
    accessTokenHash: "a".repeat(64),
    document: document(completed),
  };
}

test("D1 workspace store creates, reads, and updates prepared-statement records", async () => {
  const database = new FakeD1Database();
  const store = new D1WorkspaceStore(database);

  await store.create(record());
  assert.deepEqual(await store.get("workspace-1"), record());

  await store.put(record(true));
  assert.deepEqual(await store.get("workspace-1"), record(true));
  assert.equal(database.queries.length, 4);
  assert.ok(database.queries.every((query) => query.includes("?")));
  assert.ok(database.queries.every((query) => !query.includes("workspace-1")));
});

test("D1 workspace store preserves create and update existence semantics", async () => {
  const database = new FakeD1Database();
  const store = new D1WorkspaceStore(database);

  await store.create(record());
  await assert.rejects(
    store.create(record()),
    /Workspace already exists/,
  );
  await assert.rejects(
    store.put({
      ...record(),
      workspaceId: "missing-workspace",
    }),
    /Workspace does not exist/,
  );
});

test("D1 workspace store migrates legacy v2 workspace JSON on read", async () => {
  const database = new FakeD1Database();
  database.rows.set("workspace-1", {
    workspace_id: "workspace-1",
    access_token_hash: "a".repeat(64),
    document_json: JSON.stringify({
      version: 1,
      workspace: {
        version: 2,
        selectedOpportunityId: "legacy-opportunity",
        checklistByOpportunity: {
          "legacy-opportunity": { eligibility: true },
        },
      },
      founderContact: { name: "", role: "", email: "" },
      updatedAt: "2026-08-15T00:00:00.000Z",
    }),
    updated_at: "2026-08-15T00:00:00.000Z",
  });

  const stored = await new D1WorkspaceStore(database).get("workspace-1");
  assert.equal(stored?.document.workspace.version, 3);
  assert.deepEqual(stored?.document.workspace.savedOpportunityIds, []);
  assert.equal(
    stored?.document.workspace.checklistByOpportunity["legacy-opportunity"].eligibility,
    true,
  );
});

test("D1 workspace store rejects malformed persisted documents", async () => {
  const database = new FakeD1Database();
  database.rows.set("workspace-1", {
    workspace_id: "workspace-1",
    access_token_hash: "a".repeat(64),
    document_json: "{\"version\":2}",
    updated_at: "2026-08-15T00:00:00.000Z",
  });

  await assert.rejects(
    new D1WorkspaceStore(database).get("workspace-1"),
    /Workspace record is invalid/,
  );
});
