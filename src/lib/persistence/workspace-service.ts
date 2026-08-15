import {
  normalizeFounderContact,
  parseFounderContact,
  type FounderContact,
} from "../application-workspace";
import type { WorkspaceState } from "../workspace-state";
import type {
  PersistedWorkspaceDocument,
  StoredWorkspaceRecord,
  WorkspaceStore,
} from "./workspace-store";

const encoder = new TextEncoder();
const UNSAFE_RECORD_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_OPPORTUNITIES = 100;
const MAX_CHECKLIST_ITEMS = 100;

function safeRecordKey(value: string) {
  return value.length > 0
    && value.length <= 256
    && !UNSAFE_RECORD_KEYS.has(value);
}

function bytesToBase64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function createAccessToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function hashAccessToken(accessToken: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(accessToken));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")).join("");
}

function equalHash(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function parseWorkspaceState(value: unknown): WorkspaceState | null {
  if (!value || typeof value !== "object") return null;
  const workspace = value as Record<string, unknown>;
  if (
    workspace.version !== 2
    || typeof workspace.selectedOpportunityId !== "string"
    || (
      workspace.selectedOpportunityId.length > 0
      && !safeRecordKey(workspace.selectedOpportunityId)
    )
    || !workspace.checklistByOpportunity
    || typeof workspace.checklistByOpportunity !== "object"
    || Array.isArray(workspace.checklistByOpportunity)
  ) {
    return null;
  }

  const opportunityEntries = Object.entries(
    workspace.checklistByOpportunity,
  );
  if (opportunityEntries.length > MAX_OPPORTUNITIES) return null;
  const checklistByOpportunity = Object.create(null) as WorkspaceState[
    "checklistByOpportunity"
  ];
  for (const [opportunityId, checklistValue] of opportunityEntries) {
    if (
      !safeRecordKey(opportunityId)
      || !checklistValue
      || typeof checklistValue !== "object"
      || Array.isArray(checklistValue)
    ) {
      return null;
    }
    const checklistEntries = Object.entries(checklistValue);
    if (checklistEntries.length > MAX_CHECKLIST_ITEMS) return null;
    const checklist = Object.create(null) as Record<string, boolean>;
    for (const [itemId, completed] of checklistEntries) {
      if (!safeRecordKey(itemId) || typeof completed !== "boolean") return null;
      checklist[itemId] = completed;
    }
    checklistByOpportunity[opportunityId] = checklist;
  }

  return {
    version: 2,
    selectedOpportunityId: workspace.selectedOpportunityId,
    checklistByOpportunity,
  };
}

export interface CreateWorkspaceInput {
  workspace: WorkspaceState;
  founderContact: FounderContact;
}

export interface WorkspaceCredentials {
  workspaceId: string;
  accessToken: string;
  document: PersistedWorkspaceDocument;
}

export async function createPersistedWorkspace(
  store: WorkspaceStore,
  input: CreateWorkspaceInput,
): Promise<WorkspaceCredentials> {
  const workspace = parseWorkspaceState(input.workspace);
  const founderContact = parseFounderContact(input.founderContact);
  if (!workspace || !founderContact) {
    throw new Error("Workspace persistence input is invalid.");
  }
  const workspaceId = crypto.randomUUID();
  const accessToken = createAccessToken();
  const record: StoredWorkspaceRecord = {
    workspaceId,
    accessTokenHash: await hashAccessToken(accessToken),
    document: {
      version: 1,
      workspace: structuredClone(workspace),
      founderContact: normalizeFounderContact(founderContact),
      updatedAt: new Date().toISOString(),
    },
  };
  await store.create(record);
  return {
    workspaceId,
    accessToken,
    document: structuredClone(record.document),
  };
}

export async function readPersistedWorkspace(
  store: WorkspaceStore,
  workspaceId: string,
  accessToken: string,
): Promise<PersistedWorkspaceDocument | null> {
  const record = await store.get(workspaceId);
  if (!record || !accessToken) return null;
  const suppliedHash = await hashAccessToken(accessToken);
  if (!equalHash(record.accessTokenHash, suppliedHash)) return null;
  return structuredClone(record.document);
}

export async function updatePersistedWorkspace(
  store: WorkspaceStore,
  workspaceId: string,
  accessToken: string,
  input: CreateWorkspaceInput,
): Promise<PersistedWorkspaceDocument | null> {
  const workspace = parseWorkspaceState(input.workspace);
  const founderContact = parseFounderContact(input.founderContact);
  if (!workspace || !founderContact) {
    throw new Error("Workspace persistence input is invalid.");
  }
  const record = await store.get(workspaceId);
  if (!record || !accessToken) return null;
  const suppliedHash = await hashAccessToken(accessToken);
  if (!equalHash(record.accessTokenHash, suppliedHash)) return null;

  const document: PersistedWorkspaceDocument = {
    version: 1,
    workspace: structuredClone(workspace),
    founderContact: normalizeFounderContact(founderContact),
    updatedAt: new Date().toISOString(),
  };
  await store.put({
    workspaceId,
    accessTokenHash: record.accessTokenHash,
    document,
  });
  return structuredClone(document);
}
