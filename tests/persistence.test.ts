import assert from "node:assert/strict";
import test from "node:test";
import {
  GET as unconfiguredGet,
} from "../src/app/api/workspace/route";
import {
  missingFounderContactQuestions,
  normalizeFounderContact,
} from "../src/lib/application-workspace";
import {
  D1WorkspaceStore,
  type WorkspaceD1PreparedStatement,
  workspaceStoreFromCloudflareEnv,
} from "../src/lib/persistence/d1-workspace-store";
import { createWorkspaceHandlers } from "../src/lib/persistence/workspace-route-handlers";
import {
  MemoryWorkspaceStore,
  type StoredWorkspaceRecord,
  type WorkspaceStore,
} from "../src/lib/persistence/workspace-store";
import type {
  WorkspaceState,
  WorkspaceStateV3,
} from "../src/lib/workspace-state";

const INITIAL_WORKSPACE: WorkspaceState = {
  version: 2,
  selectedOpportunityId: "grants-359666",
  checklistByOpportunity: {
    "grants-359666": {
      eligibility: false,
    },
  },
};

const MIGRATED_INITIAL_WORKSPACE: WorkspaceStateV3 = {
  version: 3,
  selectedOpportunityId: "grants-359666",
  savedOpportunityIds: [],
  savedOpportunityStateByOpportunityId: {},
  checklistByOpportunity: {
    "grants-359666": {
      eligibility: false,
    },
  },
};

function jsonRequest(
  url: string,
  method: "POST" | "PUT",
  body: unknown,
  accessToken?: string,
) {
  return new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

class RecordingWorkspaceStore implements WorkspaceStore {
  createCalls = 0;
  record: StoredWorkspaceRecord | null = null;

  async create(record: StoredWorkspaceRecord) {
    this.createCalls += 1;
    this.record = structuredClone(record);
  }

  async get(workspaceId: string) {
    return this.record?.workspaceId === workspaceId
      ? structuredClone(this.record)
      : null;
  }

  async put(record: StoredWorkspaceRecord) {
    this.record = structuredClone(record);
  }
}

test("founder contact stays outside matching and produces only missing-field questions", () => {
  const contact = normalizeFounderContact({
    name: "  Ada Founder ",
    role: "",
    email: " ada@example.com ",
  });

  assert.deepEqual(contact, {
    name: "Ada Founder",
    role: "",
    email: "ada@example.com",
  });
  assert.deepEqual(missingFounderContactQuestions(contact), [
    {
      field: "role",
      prompt: "What is your role at the company?",
    },
  ]);
});

test("opaque credentials isolate workspace reads and updates", async () => {
  const handlers = createWorkspaceHandlers(new MemoryWorkspaceStore());
  const createResponse = await handlers.POST(jsonRequest(
    "https://example.test/api/workspace",
    "POST",
    {
      workspace: INITIAL_WORKSPACE,
      founderContact: {
        name: "Ada Founder",
        role: "",
        email: "",
      },
    },
  ));
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.match(created.workspaceId, /^[0-9a-f-]{36}$/);
  assert.match(created.accessToken, /^[A-Za-z0-9_-]{40,}$/);
  assert.deepEqual(created.missingFounderQuestions.map(
    (question: { field: string }) => question.field,
  ), ["role", "email"]);

  const unauthorized = await handlers.GET(new Request(
    `https://example.test/api/workspace?workspaceId=${created.workspaceId}`,
  ));
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(await unauthorized.json(), {
    error: "Workspace credentials are invalid.",
  });

  const authorized = await handlers.GET(new Request(
    `https://example.test/api/workspace?workspaceId=${created.workspaceId}`,
    {
      headers: {
        Authorization: `Bearer ${created.accessToken}`,
      },
    },
  ));
  assert.equal(authorized.status, 200);
  assert.deepEqual((await authorized.json()).workspace, MIGRATED_INITIAL_WORKSPACE);

  const updatedWorkspace: WorkspaceState = {
    ...INITIAL_WORKSPACE,
    checklistByOpportunity: {
      "grants-359666": {
        eligibility: true,
      },
    },
  };
  const updateResponse = await handlers.PUT(jsonRequest(
    "https://example.test/api/workspace",
    "PUT",
    {
      workspaceId: created.workspaceId,
      workspace: updatedWorkspace,
      founderContact: {
        name: "Ada Founder",
        role: "CEO",
        email: "ada@example.com",
      },
    },
    created.accessToken,
  ));
  assert.equal(updateResponse.status, 200);
  const updated = await updateResponse.json();
  assert.equal(
    updated.workspace.checklistByOpportunity["grants-359666"].eligibility,
    true,
  );
  assert.deepEqual(updated.missingFounderQuestions, []);

  const secondResponse = await handlers.POST(jsonRequest(
    "https://example.test/api/workspace",
    "POST",
    {
      workspace: {
        version: 2,
        selectedOpportunityId: "",
        checklistByOpportunity: {},
      },
      founderContact: {
        name: "",
        role: "",
        email: "",
      },
    },
  ));
  const second = await secondResponse.json();
  const crossWorkspace = await handlers.GET(new Request(
    `https://example.test/api/workspace?workspaceId=${second.workspaceId}`,
    {
      headers: {
        Authorization: `Bearer ${created.accessToken}`,
      },
    },
  ));
  assert.equal(crossWorkspace.status, 401);
});

test("v3 persistence preserves ordered saved opportunities and sparse pursuit states", async () => {
  const handlers = createWorkspaceHandlers(new MemoryWorkspaceStore());
  const workspace: WorkspaceStateV3 = {
    version: 3,
    selectedOpportunityId: "grants-b",
    savedOpportunityIds: ["grants-b", "grants-a"],
    savedOpportunityStateByOpportunityId: {
      "grants-b": "verifying",
      "grants-a": "done",
    },
    checklistByOpportunity: {
      "grants-b": { eligibility: true },
    },
  };
  const response = await handlers.POST(jsonRequest(
    "https://example.test/api/workspace",
    "POST",
    {
      workspace,
      founderContact: { name: "", role: "", email: "" },
    },
  ));
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(body.workspace.savedOpportunityIds, ["grants-b", "grants-a"]);
  assert.deepEqual(body.workspace.savedOpportunityStateByOpportunityId, {
    "grants-b": "verifying",
    "grants-a": "done",
  });
});

test("workspace stores receive only token hashes", async () => {
  const store = new RecordingWorkspaceStore();
  const handlers = createWorkspaceHandlers(store);
  const response = await handlers.POST(jsonRequest(
    "https://example.test/api/workspace",
    "POST",
    {
      workspace: INITIAL_WORKSPACE,
      founderContact: {
        name: "Private Founder",
        role: "",
        email: "",
      },
    },
  ));
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.ok(store.record);
  assert.match(store.record.accessTokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(store.record.accessTokenHash, body.accessToken);
  assert.equal("accessToken" in store.record, false);
});

test("default workspace route stays unavailable until durable storage is configured", async () => {
  const response = await unconfiguredGet(new Request(
    "https://example.test/api/workspace?workspaceId=unconfigured",
    {
      headers: {
        Authorization: "Bearer unconfigured",
      },
    },
  ));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "Durable workspace storage is not configured.",
  });
});

test("workspace route selects D1 only when the Cloudflare binding is available", () => {
  const statement: WorkspaceD1PreparedStatement = {
    bind: () => statement,
    first: async () => null,
    run: async () => ({ success: true, meta: { changes: 1 } }),
  };
  const database = {
    prepare: () => statement,
  };

  assert.ok(
    workspaceStoreFromCloudflareEnv({ WORKSPACE_DB: database })
      instanceof D1WorkspaceStore,
  );
  assert.equal(workspaceStoreFromCloudflareEnv({}), null);
  assert.equal(
    workspaceStoreFromCloudflareEnv({ WORKSPACE_DB: { prepare: "invalid" } }),
    null,
  );
});

test("workspace persistence rejects prototype-polluting checklist keys", async () => {
  const handlers = createWorkspaceHandlers(new MemoryWorkspaceStore());
  const unsafeChecklist = Object.fromEntries([
    ["__proto__", { eligibility: true }],
  ]);
  const response = await handlers.POST(jsonRequest(
    "https://example.test/api/workspace",
    "POST",
    {
      workspace: {
        version: 2,
        selectedOpportunityId: "",
        checklistByOpportunity: unsafeChecklist,
      },
      founderContact: {
        name: "",
        role: "",
        email: "",
      },
    },
  ));

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "A valid WorkspaceState v2 or v3 body is required.",
  });
});

test("workspace persistence rejects oversized persisted strings before store access", async () => {
  const oversizedValues = [
    {
      workspace: {
        ...INITIAL_WORKSPACE,
        selectedOpportunityId: "x".repeat(10_000),
      },
      founderContact: { name: "", role: "", email: "" },
    },
    {
      workspace: INITIAL_WORKSPACE,
      founderContact: {
        name: "x".repeat(10_000),
        role: "",
        email: "",
      },
    },
  ];

  for (const body of oversizedValues) {
    const store = new RecordingWorkspaceStore();
    const response = await createWorkspaceHandlers(store).POST(jsonRequest(
      "https://example.test/api/workspace",
      "POST",
      body,
    ));

    assert.equal(response.status, 400);
    assert.equal(store.createCalls, 0);
  }
});

test("workspace route rejects oversized request bodies before store access", async () => {
  const store = new RecordingWorkspaceStore();
  const response = await createWorkspaceHandlers(store).POST(jsonRequest(
    "https://example.test/api/workspace",
    "POST",
    {
      workspace: INITIAL_WORKSPACE,
      founderContact: { name: "", role: "", email: "" },
      ignoredProfile: "x".repeat(70_000),
    },
  ));

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), {
    error: "Request body is too large.",
  });
  assert.equal(store.createCalls, 0);
});
