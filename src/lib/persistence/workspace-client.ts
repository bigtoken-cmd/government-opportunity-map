import type {
  FounderContact,
  FounderContactQuestion,
} from "../application-workspace";
import type { WorkspaceState } from "../workspace-state";

export type WorkspaceFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface WorkspaceClientInput {
  workspace: WorkspaceState;
  founderContact: FounderContact;
}

export interface WorkspaceClientCredentials {
  workspaceId: string;
  accessToken: string;
}

export interface WorkspaceClientDocument {
  workspaceId: string;
  workspace: WorkspaceState;
  founderContact: FounderContact;
  missingFounderQuestions: FounderContactQuestion[];
  updatedAt: string;
}

export interface CreatedWorkspaceClientDocument
  extends WorkspaceClientDocument {
  accessToken: string;
}

export class WorkspaceClientError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "WorkspaceClientError";
    this.status = status;
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const message = body
      && typeof body === "object"
      && !Array.isArray(body)
      && typeof (body as Record<string, unknown>).error === "string"
      ? String((body as Record<string, unknown>).error)
      : "Workspace request failed.";
    throw new WorkspaceClientError(message, response.status);
  }
  return body as T;
}

export function createWorkspaceClient(
  fetcher: WorkspaceFetch = fetch,
  endpoint = "/api/workspace",
) {
  return {
    async create(
      input: WorkspaceClientInput,
    ): Promise<CreatedWorkspaceClientDocument> {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });
      return readResponse<CreatedWorkspaceClientDocument>(response);
    },

    async get(
      credentials: WorkspaceClientCredentials,
    ): Promise<WorkspaceClientDocument> {
      const response = await fetcher(
        `${endpoint}?workspaceId=${encodeURIComponent(credentials.workspaceId)}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
          },
        },
      );
      return readResponse<WorkspaceClientDocument>(response);
    },

    async put(
      credentials: WorkspaceClientCredentials,
      input: WorkspaceClientInput,
    ): Promise<WorkspaceClientDocument> {
      const response = await fetcher(endpoint, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId: credentials.workspaceId,
          ...input,
        }),
      });
      return readResponse<WorkspaceClientDocument>(response);
    },
  };
}
