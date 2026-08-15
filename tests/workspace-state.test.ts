import assert from "node:assert/strict";
import test from "node:test";
import {
  hydrateWorkspace,
  removeSavedOpportunity,
  saveOpportunity,
  serializeWorkspace,
  setChecklistItem,
  setSavedOpportunityState,
  type WorkspaceStateV3,
} from "../src/lib/workspace-state";

const EMPTY_WORKSPACE: WorkspaceStateV3 = {
  version: 3,
  selectedOpportunityId: "",
  savedOpportunityIds: [],
  savedOpportunityStateByOpportunityId: {},
  checklistByOpportunity: {},
};

test("checklist state is independent for each opportunity and survives v3 hydration", () => {
  const initial = hydrateWorkspace(null);
  const forFirst = setChecklistItem(initial, "opportunity-a", "registrations", true);
  const forSecond = setChecklistItem(forFirst, "opportunity-b", "registrations", true);
  const restored = hydrateWorkspace(serializeWorkspace(forSecond));

  assert.deepEqual(
    Object.keys(restored).sort(),
    [
      "checklistByOpportunity",
      "savedOpportunityIds",
      "savedOpportunityStateByOpportunityId",
      "selectedOpportunityId",
      "version",
    ],
  );
  assert.deepEqual(JSON.parse(serializeWorkspace(restored)), {
    version: 3,
    selectedOpportunityId: "",
    savedOpportunityIds: [],
    savedOpportunityStateByOpportunityId: {},
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

test("v2 hydration preserves old state without guessing that selection or checklists were saved", () => {
  const restored = hydrateWorkspace(JSON.stringify({
    version: 2,
    selectedOpportunityId: "legacy-opportunity",
    checklistByOpportunity: {
      "legacy-opportunity": { registrations: true },
    },
  }));
  assert.equal(restored.version, 3);
  assert.equal(restored.selectedOpportunityId, "legacy-opportunity");
  assert.deepEqual(restored.savedOpportunityIds, []);
  assert.deepEqual(restored.savedOpportunityStateByOpportunityId, {});
  assert.equal(restored.checklistByOpportunity["legacy-opportunity"].registrations, true);
});

test("saved opportunity order and pursuit state round-trip deterministically", () => {
  const first = saveOpportunity(EMPTY_WORKSPACE, "opportunity-b");
  const second = saveOpportunity(first, "opportunity-a");
  const pursuing = setSavedOpportunityState(second, "opportunity-b", "pursuing");
  const restored = hydrateWorkspace(serializeWorkspace(pursuing));

  assert.deepEqual(restored.savedOpportunityIds, ["opportunity-b", "opportunity-a"]);
  assert.equal(restored.savedOpportunityStateByOpportunityId["opportunity-b"], "pursuing");
  const reset = setSavedOpportunityState(restored, "opportunity-b", "saved");
  assert.equal("opportunity-b" in reset.savedOpportunityStateByOpportunityId, false);
  const removed = removeSavedOpportunity(reset, "opportunity-b");
  assert.deepEqual(removed.savedOpportunityIds, ["opportunity-a"]);
});

test("local hydration and mutators reject prototype-polluting keys", () => {
  const restored = hydrateWorkspace([
    "{\"version\":3,\"selectedOpportunityId\":\"\",",
    "\"savedOpportunityIds\":[\"__proto__\",\"safe-opportunity\"],",
    "\"savedOpportunityStateByOpportunityId\":{\"__proto__\":\"done\",\"safe-opportunity\":\"done\"},",
    "\"checklistByOpportunity\":{\"__proto__\":{\"polluted\":true},\"safe-opportunity\":{\"constructor\":true,\"eligibility\":true}}}",
  ].join(""));

  assert.deepEqual(restored.savedOpportunityIds, ["safe-opportunity"]);
  assert.equal(restored.savedOpportunityStateByOpportunityId["safe-opportunity"], "done");
  assert.equal("__proto__" in restored.checklistByOpportunity, true);
  assert.equal(Object.hasOwn(restored.checklistByOpportunity, "__proto__"), false);
  assert.deepEqual(restored.checklistByOpportunity["safe-opportunity"], { eligibility: true });
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);

  assert.deepEqual(saveOpportunity(restored, "__proto__"), restored);
  assert.equal(
    setChecklistItem(restored, "safe-opportunity", "constructor", true),
    restored,
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
