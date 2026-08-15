import assert from "node:assert/strict";
import test from "node:test";
import {
  ADVERSARIAL_HOLDOUTS,
  OFFICIAL_PROFILE_FIXTURES,
} from "./fixtures/official-profile-fixtures";
import { normalizeFounderProfile } from "../src/lib/intake/profile-normalization";
import { searchGovernmentSources } from "../src/lib/opportunity-search";

test("the five verifier-only profiles share the public cached source pipeline", async () => {
  const results = await Promise.all(
    OFFICIAL_PROFILE_FIXTURES.map((fixture) =>
      searchGovernmentSources(normalizeFounderProfile(fixture.profile), { mode: "cached" }),
    ),
  );

  assert.equal(results.length, 5);
  assert.ok(results.every((result) => result.sources.length === 4));
  assert.ok(results.every((result) =>
    result.discovery.recommendations.length <= 5,
  ));
});

test("adversarial holdouts do not receive Strong Fit recommendations", async () => {
  assert.equal(ADVERSARIAL_HOLDOUTS.length, 3);
  for (const profile of ADVERSARIAL_HOLDOUTS) {
    const result = await searchGovernmentSources(normalizeFounderProfile(profile), { mode: "cached" });
    assert.ok(result.discovery.recommendations.every(
      (recommendation) => recommendation.match.fitStatus !== "Strong Fit",
    ));
  }
});
