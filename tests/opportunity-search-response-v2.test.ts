import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { opportunitySearchResponseV2Fixture } from "./fixtures/opportunity-search-response-v2";

test("the test-only v2 fixture exposes the additive recommendation seam", () => {
  const recommendation = opportunitySearchResponseV2Fixture.discovery.recommendations[0];
  assert.equal(opportunitySearchResponseV2Fixture.discovery.resultMeta.resultCap, 20);
  assert.equal(recommendation.intelligence.routeType, "verify");
  assert.ok(recommendation.intelligence.whyFit[0].opportunityEvidenceId);
  assert.equal(recommendation.intelligence.nextAction.type, "verify");
});

test("production modules never import the test-only v2 fixture", () => {
  const files = [
    "src/lib/opportunity-search.ts",
    "src/lib/opportunity-discovery.ts",
    "src/app/api/opportunities/search/route.ts",
  ];
  for (const file of files) {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    assert.equal(source.includes("opportunity-search-response-v2"), false, file);
  }
});
