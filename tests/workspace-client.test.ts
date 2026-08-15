import assert from "node:assert/strict";
import test from "node:test";
import {
  WorkspaceClientError,
  createWorkspaceClient,
  type WorkspaceFetch,
} from "../src/lib/persistence/workspace-client";
import type { WorkspaceState } from "../src/lib/workspace-state";

const WORKSPACE: WorkspaceState = {
  version: 2,
  selectedOpportunityId: "grants-359666",
  checklistByOpportunity: {
    "grants-359666": {
      eligibility: false,
    },
  },
};

const FOUNDER_CONTACT = {
  name: "Ada Founder",
  role: "CEO",
  email: "ada@example.com",
};

function workspaceResponse(accessToken?: string) {
  return {
    workspaceId: "workspace-1",
    ...(accessToken ? { accessToken } : {}),
    workspace: WORKSPACE,
    founderContact: FOUNDER_CONTACT,
    missingFounderQuestions: [],
    updatedAt: "2026-08-15T00:00:00.000Z",
  };
}

test("workspace client creates a workspace with the POST contract", async () => {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetcher: WorkspaceFetch = async (input, init) => {
    requests.push({ input, init });
    return Response.json(workspaceResponse("opaque-token"), { status: 201 });
  };

  const created = await createWorkspaceClient(fetcher).create({
    workspace: WORKSPACE,
    founderContact: FOUNDER_CONTACT,
  });

  assert.deepEqual(created, workspaceResponse("opaque-token"));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].input, "/api/workspace");
  assert.equal(requests[0].init?.method, "POST");
  assert.deepEqual(requests[0].init?.headers, {
    "Content-Type": "application/json",
  });
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
    workspace: WORKSPACE,
    founderContact: FOUNDER_CONTACT,
  });
});

test("workspace client reads and updates with bearer credentials", async () => {
  const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const responses = [
    Response.json(workspaceResponse()),
    Response.json(workspaceResponse()),
  ];
  const fetcher: WorkspaceFetch = async (input, init) => {
    requests.push({ input, init });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected request.");
    return response;
  };
  const client = createWorkspaceClient(fetcher);
  const credentials = {
    workspaceId: "workspace /1",
    accessToken: "opaque-token",
  };

  await client.get(credentials);
  await client.put(credentials, {
    workspace: WORKSPACE,
    founderContact: FOUNDER_CONTACT,
  });

  assert.equal(
    requests[0].input,
    "/api/workspace?workspaceId=workspace%20%2F1",
  );
  assert.equal(requests[0].init?.method, "GET");
  assert.deepEqual(requests[0].init?.headers, {
    Authorization: "Bearer opaque-token",
  });
  assert.equal(requests[1].input, "/api/workspace");
  assert.equal(requests[1].init?.method, "PUT");
  assert.deepEqual(requests[1].init?.headers, {
    Authorization: "Bearer opaque-token",
    "Content-Type": "application/json",
  });
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), {
    workspaceId: "workspace /1",
    workspace: WORKSPACE,
    founderContact: FOUNDER_CONTACT,
  });
});

test("workspace client exposes response status without exposing credentials", async () => {
  const fetcher: WorkspaceFetch = async () =>
    Response.json(
      { error: "Durable workspace storage is not configured." },
      { status: 503 },
    );

  await assert.rejects(
    createWorkspaceClient(fetcher).get({
      workspaceId: "workspace-1",
      accessToken: "opaque-token",
    }),
    (error: unknown) => {
      assert.ok(error instanceof WorkspaceClientError);
      assert.equal(error.status, 503);
      assert.equal(error.message, "Durable workspace storage is not configured.");
      assert.equal(error.message.includes("opaque-token"), false);
      return true;
    },
  );
});
