export interface WorkspaceStateV2 {
  version: 2;
  selectedOpportunityId: string;
  checklistByOpportunity: Record<string, Record<string, boolean>>;
}

export type SavedOpportunityState = "saved" | "verifying" | "pursuing" | "done";
export type ActiveSavedOpportunityState = Exclude<SavedOpportunityState, "saved">;

export interface WorkspaceStateV3 {
  version: 3;
  selectedOpportunityId: string;
  savedOpportunityIds: string[];
  /** Missing entries mean Saved; only active states are stored. */
  savedOpportunityStateByOpportunityId: Record<string, ActiveSavedOpportunityState>;
  checklistByOpportunity: Record<string, Record<string, boolean>>;
}

export type WorkspaceState = WorkspaceStateV2 | WorkspaceStateV3;

const UNSAFE_RECORD_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function safeRecordKey(value: string) {
  return value.length > 0
    && value.length <= 256
    && !UNSAFE_RECORD_KEYS.has(value);
}

const EMPTY_WORKSPACE: WorkspaceStateV3 = {
  version: 3,
  selectedOpportunityId: "",
  savedOpportunityIds: [],
  savedOpportunityStateByOpportunityId: {},
  checklistByOpportunity: {},
};

function checklist(value: unknown): Record<string, Record<string, boolean>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, Record<string, boolean>> = {};
  for (const [opportunityId, checklistValue] of Object.entries(value)) {
    if (
      !safeRecordKey(opportunityId)
      || !checklistValue
      || typeof checklistValue !== "object"
      || Array.isArray(checklistValue)
    ) {
      continue;
    }
    const items: Record<string, boolean> = {};
    for (const [itemId, completed] of Object.entries(checklistValue)) {
      if (safeRecordKey(itemId) && typeof completed === "boolean") items[itemId] = completed;
    }
    result[opportunityId] = items;
  }
  return result;
}

function savedOpportunityIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string =>
    typeof id === "string" && safeRecordKey(id)))];
}

function savedOpportunityStates(
  value: unknown,
  savedIds: readonly string[],
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const saved = new Set(savedIds);
  return Object.fromEntries(Object.entries(value).filter(
    ([id, state]) => safeRecordKey(id)
      && saved.has(id)
      && (state === "verifying" || state === "pursuing" || state === "done"),
  )) as WorkspaceStateV3["savedOpportunityStateByOpportunityId"];
}

export function migrateWorkspace(state: WorkspaceState): WorkspaceStateV3 {
  if (state.version === 3) {
    const savedIds = savedOpportunityIds(state.savedOpportunityIds);
    return {
      version: 3,
      selectedOpportunityId: safeRecordKey(state.selectedOpportunityId)
        ? state.selectedOpportunityId
        : "",
      savedOpportunityIds: savedIds,
      savedOpportunityStateByOpportunityId: savedOpportunityStates(
        state.savedOpportunityStateByOpportunityId,
        savedIds,
      ),
      checklistByOpportunity: checklist(state.checklistByOpportunity),
    };
  }
  return {
    version: 3,
    selectedOpportunityId: safeRecordKey(state.selectedOpportunityId)
      ? state.selectedOpportunityId
      : "",
    savedOpportunityIds: [],
    savedOpportunityStateByOpportunityId: {},
    checklistByOpportunity: checklist(state.checklistByOpportunity),
  };
}

export function hydrateWorkspace(serialized: string | null): WorkspaceStateV3 {
  if (!serialized) return structuredClone(EMPTY_WORKSPACE);

  try {
    const value = JSON.parse(serialized) as Record<string, unknown>;
    if (
      !value
      || typeof value !== "object"
      || (value.version !== 2 && value.version !== 3)
      || typeof value.selectedOpportunityId !== "string"
      || (value.selectedOpportunityId.length > 0 && !safeRecordKey(value.selectedOpportunityId))
    ) {
      return structuredClone(EMPTY_WORKSPACE);
    }
    if (value.version === 2) {
      return migrateWorkspace({
        version: 2,
        selectedOpportunityId: value.selectedOpportunityId,
        checklistByOpportunity: checklist(value.checklistByOpportunity),
      });
    }
    const ids = savedOpportunityIds(value.savedOpportunityIds);
    return migrateWorkspace({
      version: 3,
      selectedOpportunityId: value.selectedOpportunityId,
      savedOpportunityIds: ids,
      savedOpportunityStateByOpportunityId: savedOpportunityStates(
        value.savedOpportunityStateByOpportunityId,
        ids,
      ),
      checklistByOpportunity: checklist(value.checklistByOpportunity),
    });
  } catch {
    return structuredClone(EMPTY_WORKSPACE);
  }
}

export function serializeWorkspace(state: WorkspaceState): string {
  return JSON.stringify(migrateWorkspace(state));
}

export function setChecklistItem<TState extends WorkspaceState>(
  state: TState,
  opportunityId: string,
  itemId: string,
  completed: boolean,
): TState {
  if (!safeRecordKey(opportunityId) || !safeRecordKey(itemId)) return state;
  return {
    ...state,
    checklistByOpportunity: {
      ...state.checklistByOpportunity,
      [opportunityId]: {
        ...state.checklistByOpportunity[opportunityId],
        [itemId]: completed,
      },
    },
  };
}

export function saveOpportunity(
  state: WorkspaceState,
  opportunityId: string,
): WorkspaceStateV3 {
  const current = migrateWorkspace(state);
  if (!safeRecordKey(opportunityId)) return current;
  return current.savedOpportunityIds.includes(opportunityId)
    ? current
    : {
        ...current,
        savedOpportunityIds: [...current.savedOpportunityIds, opportunityId],
      };
}

export function setSavedOpportunityState(
  state: WorkspaceState,
  opportunityId: string,
  pursuitState: SavedOpportunityState,
): WorkspaceStateV3 {
  const current = saveOpportunity(state, opportunityId);
  if (!safeRecordKey(opportunityId)) return current;
  const states = { ...current.savedOpportunityStateByOpportunityId };
  if (pursuitState === "saved") delete states[opportunityId];
  else states[opportunityId] = pursuitState;
  return {
    ...current,
    savedOpportunityStateByOpportunityId: states,
  };
}

export function removeSavedOpportunity(
  state: WorkspaceState,
  opportunityId: string,
): WorkspaceStateV3 {
  const current = migrateWorkspace(state);
  if (!safeRecordKey(opportunityId)) return current;
  const states = { ...current.savedOpportunityStateByOpportunityId };
  delete states[opportunityId];
  return {
    ...current,
    savedOpportunityIds: current.savedOpportunityIds.filter((id) => id !== opportunityId),
    savedOpportunityStateByOpportunityId: states,
  };
}
