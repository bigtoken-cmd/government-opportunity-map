export interface WorkspaceState {
  version: 2;
  selectedOpportunityId: string;
  checklistByOpportunity: Record<string, Record<string, boolean>>;
}

const EMPTY_WORKSPACE: WorkspaceState = {
  version: 2,
  selectedOpportunityId: "",
  checklistByOpportunity: {},
};

export function hydrateWorkspace(serialized: string | null): WorkspaceState {
  if (!serialized) return EMPTY_WORKSPACE;

  try {
    const value = JSON.parse(serialized) as Partial<WorkspaceState>;
    if (value.version !== 2 || !value.checklistByOpportunity || typeof value.checklistByOpportunity !== "object") {
      return EMPTY_WORKSPACE;
    }
    return {
      version: 2,
      selectedOpportunityId: typeof value.selectedOpportunityId === "string" ? value.selectedOpportunityId : "",
      checklistByOpportunity: Object.fromEntries(
        Object.entries(value.checklistByOpportunity).flatMap(([opportunityId, checklist]) =>
          checklist && typeof checklist === "object"
            ? [[opportunityId, Object.fromEntries(
              Object.entries(checklist).filter(([, completed]) => typeof completed === "boolean"),
            )]]
            : [],
        ),
      ),
    };
  } catch {
    return EMPTY_WORKSPACE;
  }
}

export function serializeWorkspace(state: WorkspaceState): string {
  return JSON.stringify(state);
}

export function setChecklistItem(
  state: WorkspaceState,
  opportunityId: string,
  itemId: string,
  completed: boolean,
): WorkspaceState {
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
