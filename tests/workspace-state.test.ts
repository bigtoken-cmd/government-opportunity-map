import assert from "node:assert/strict";
import test from "node:test";
import {
  hydrateWorkspace,
  serializeWorkspace,
  setChecklistItem,
  type WorkspaceState,
} from "../src/lib/workspace-state";

const EMPTY_WORKSPACE: WorkspaceState = {
  version: 2,
  selectedOpportunityId: "",
  checklistByOpportunity: {},
};

test("checklist state is independent for each opportunity and survives hydration", () => {
  const initial = hydrateWorkspace(null);
  const forFirst = setChecklistItem(initial, "opportunity-a", "registrations", true);
  const forSecond = setChecklistItem(forFirst, "opportunity-b", "registrations", true);
  const restored = hydrateWorkspace(serializeWorkspace(forSecond));

  assert.deepEqual(
    Object.keys(restored).sort(),
    ["checklistByOpportunity", "selectedOpportunityId", "version"],
  );
  assert.deepEqual(JSON.parse(serializeWorkspace(restored)), {
    version: 2,
    selectedOpportunityId: "",
    checklistByOpportunity: {
      "opportunity-a": { registrations: true },
      "opportunity-b": { registrations: true },
    },
  });
  assert.equal(restored.checklistByOpportunity["opportunity-a"].registrations, true);
  assert.equal(restored.checklistByOpportunity["opportunity-b"].registrations, true);
  assert.notEqual(
    restored.checklistByOpportunity["opportunity-a"],
    restored.checklistByOpportunity["opportunity-b"],
  );
});

test("invalid persisted data hydrates to a safe empty workspace", () => {
  assert.deepEqual(hydrateWorkspace("{not-json"), EMPTY_WORKSPACE);
  assert.deepEqual(
    hydrateWorkspace(JSON.stringify({
      version: 1,
      selectedOpportunityId: "legacy-opportunity",
      checklistByOpportunity: {
        "legacy-opportunity": { registrations: true },
      },
    })),
    EMPTY_WORKSPACE,
  );
});
