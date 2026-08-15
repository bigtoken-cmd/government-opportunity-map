import { NextResponse } from "next/server";
import {
  missingFounderContactQuestions,
  parseFounderContact,
} from "../application-workspace";
import {
  createPersistedWorkspace,
  parseWorkspaceState,
  readPersistedWorkspace,
  updatePersistedWorkspace,
} from "./workspace-service";
import type {
  PersistedWorkspaceDocument,
  WorkspaceStore,
} from "./workspace-store";

const INVALID_CREDENTIALS = {
  error: "Workspace credentials are invalid.",
};
const STORAGE_UNAVAILABLE = {
  error: "Durable workspace storage is not configured.",
};
const MAX_REQUEST_BODY_BYTES = 64 * 1024;

function accessToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

async function requestBody(request: Request) {
  const contentLength = request.headers.get("content-length");
  const declaredLength = contentLength === null ? Number.NaN : Number(contentLength);
  if (
    Number.isFinite(declaredLength)
    && declaredLength > MAX_REQUEST_BODY_BYTES
  ) {
    return { status: "too-large" as const };
  }
  if (!request.body) return { status: "invalid" as const };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { status: "too-large" as const };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return value && typeof value === "object"
      ? { status: "ok" as const, value: value as Record<string, unknown> }
      : { status: "invalid" as const };
  } catch {
    return { status: "invalid" as const };
  } finally {
    reader.releaseLock();
  }
}

function publicDocument(
  workspaceId: string,
  document: PersistedWorkspaceDocument,
) {
  return {
    workspaceId,
    workspace: document.workspace,
    founderContact: document.founderContact,
    missingFounderQuestions: missingFounderContactQuestions(
      document.founderContact,
    ),
    updatedAt: document.updatedAt,
  };
}

export function createWorkspaceHandlers(store: WorkspaceStore | null) {
  return {
    async POST(request: Request) {
      if (!store) {
        return NextResponse.json(STORAGE_UNAVAILABLE, { status: 503 });
      }
      const parsedBody = await requestBody(request);
      if (parsedBody.status === "too-large") {
        return NextResponse.json(
          { error: "Request body is too large." },
          { status: 413 },
        );
      }
      const body = parsedBody.status === "ok" ? parsedBody.value : null;
      const workspace = parseWorkspaceState(body?.workspace);
      const founderContact = parseFounderContact(body?.founderContact);
      if (!body || !workspace || !founderContact) {
        return NextResponse.json(
          { error: "A valid WorkspaceState v2 body is required." },
          { status: 400 },
        );
      }

      const created = await createPersistedWorkspace(store, {
        workspace,
        founderContact,
      });
      return NextResponse.json(
        {
          ...publicDocument(created.workspaceId, created.document),
          accessToken: created.accessToken,
        },
        { status: 201 },
      );
    },

    async GET(request: Request) {
      if (!store) {
        return NextResponse.json(STORAGE_UNAVAILABLE, { status: 503 });
      }
      const workspaceId = new URL(request.url).searchParams
        .get("workspaceId")
        ?.trim() ?? "";
      const token = accessToken(request);
      if (!workspaceId || !token) {
        return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
      }

      const document = await readPersistedWorkspace(
        store,
        workspaceId,
        token,
      );
      return document
        ? NextResponse.json(publicDocument(workspaceId, document))
        : NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
    },

    async PUT(request: Request) {
      if (!store) {
        return NextResponse.json(STORAGE_UNAVAILABLE, { status: 503 });
      }
      const parsedBody = await requestBody(request);
      if (parsedBody.status === "too-large") {
        return NextResponse.json(
          { error: "Request body is too large." },
          { status: 413 },
        );
      }
      const body = parsedBody.status === "ok" ? parsedBody.value : null;
      const workspaceId = typeof body?.workspaceId === "string"
        ? body.workspaceId.trim()
        : "";
      const workspace = parseWorkspaceState(body?.workspace);
      const founderContact = parseFounderContact(body?.founderContact);
      const token = accessToken(request);
      if (!body || !workspaceId || !workspace || !founderContact || !token) {
        return NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
      }

      const document = await updatePersistedWorkspace(
        store,
        workspaceId,
        token,
        {
          workspace,
          founderContact,
        },
      );
      return document
        ? NextResponse.json(publicDocument(workspaceId, document))
        : NextResponse.json(INVALID_CREDENTIALS, { status: 401 });
    },
  };
}
