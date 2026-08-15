import assert from "node:assert/strict";
import test from "node:test";
import {
  hydrateWorkspace,
  serializeWorkspace,
  setChecklistItem,
} from "../src/lib/workspace-state";

test("checklist state is independent for each opportunity and survives hydration", () => {
  const initial = hydrateWorkspace(null);
  const forFirst = setChecklistItem(initial, "opportunity-a", "registrations", true);
  const forSecond = setChecklistItem(forFirst, "opportunity-b", "registrations", true);
  const restored = hydrateWorkspace(serializeWorkspace(forSecond));

  assert.equal(restored.checklistByOpportunity["opportunity-a"].registrations, true);
  assert.equal(restored.checklistByOpportunity["opportunity-b"].registrations, true);
  assert.notEqual(
    restored.checklistByOpportunity["opportunity-a"],
    restored.checklistByOpportunity["opportunity-b"],
  );
});

test("invalid persisted data hydrates to a safe empty workspace", () => {
  assert.deepEqual(hydrateWorkspace("{not-json"), {
    version: 2,
    selectedOpportunityId: "",
    checklistByOpportunity: {},
  });
});
