import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  ADVERSARIAL_HOLDOUTS,
  OFFICIAL_PROFILE_FIXTURES,
} from "./fixtures/official-profile-fixtures";
import {
  CALIBRATION_QUERY_LOG,
  type CalibrationQuery,
} from "./fixtures/calibration-query-log";
import {
  normalizeFounderProfile,
  type FounderProfileInput,
} from "../src/lib/intake/profile-normalization";
import {
  searchGovernmentSources,
  type GovernmentSourceSearchResult,
} from "../src/lib/opportunity-search";
import type { Opportunity } from "../src/lib/opportunity-types";

const PROFILE_BY_KEY = new Map<string, FounderProfileInput>();
for (const fixture of OFFICIAL_PROFILE_FIXTURES) {
  PROFILE_BY_KEY.set(fixture.key, fixture.profile);
}
for (const profile of ADVERSARIAL_HOLDOUTS) {
  PROFILE_BY_KEY.set(profile.id, profile);
}

function canonicalProvenanceHash(opportunity: Opportunity) {
  const canonicalRecord = {
    id: opportunity.id,
    opportunityNumber: opportunity.opportunityNumber ?? "",
    title: opportunity.title,
    agency: opportunity.agency,
    opportunityStatus: opportunity.opportunityStatus,
    deadline: opportunity.deadline ?? "",
    sourceId: opportunity.source.sourceId,
    sourceUrl: opportunity.source.sourceUrl,
    retrievedAt: opportunity.source.retrievedAt,
  };
  return createHash("sha256")
    .update(JSON.stringify(canonicalRecord))
    .digest("hex");
}

function assertJudgedRecommendationProvenance(
  query: CalibrationQuery,
  result: GovernmentSourceSearchResult,
) {
  const judgmentByOpportunityId = new Map(
    query.judgments.map((judgment) => [judgment.opportunityId, judgment]),
  );
  for (const recommendation of result.discovery.recommendations) {
    const judgment = judgmentByOpportunityId.get(recommendation.opportunity.id);
    if (judgment) {
      assert.equal(
        recommendation.opportunity.source.sourceId,
        judgment.sourceId,
        `${judgment.opportunityId} must retain its official source ID`,
      );
      assert.equal(
        recommendation.opportunity.source.sourceUrl,
        judgment.sourceUrl,
        `${judgment.opportunityId} must retain its official source URL`,
      );
      assert.equal(
        recommendation.opportunity.source.retrievedAt,
        judgment.retrievedAt,
        `${judgment.opportunityId} must retain its official retrieval timestamp`,
      );
      assert.equal(
        canonicalProvenanceHash(recommendation.opportunity),
        judgment.provenanceHash,
        `${judgment.opportunityId} canonical provenance hash changed`,
      );
    }
  }
}

async function runCachedPipeline(
  query: CalibrationQuery,
): Promise<GovernmentSourceSearchResult> {
  const profile = PROFILE_BY_KEY.get(query.profileKey);
  assert.ok(profile, `Missing profile fixture for ${query.profileKey}`);
  const result = await searchGovernmentSources(
    normalizeFounderProfile(profile),
    { mode: "cached" },
  );
  assert.equal(
    result.query.keyword,
    query.query,
    `${query.profileKey} must use its frozen query through the production pipeline`,
  );
  assertJudgedRecommendationProvenance(query, result);
  return result;
}

function relevantOpportunityIds(query: CalibrationQuery) {
  return new Set(
    query.judgments
      .filter((judgment) => judgment.relevant)
      .map((judgment) => judgment.opportunityId),
  );
}

function recommendationLabels(
  query: CalibrationQuery,
  result: GovernmentSourceSearchResult,
) {
  const judgmentByOpportunityId = new Map(
    query.judgments.map((judgment) => [judgment.opportunityId, judgment]),
  );
  return result.discovery.recommendations.slice(0, 10).map((recommendation) => ({
    opportunityId: recommendation.opportunity.id,
    judgment: judgmentByOpportunityId.get(recommendation.opportunity.id),
  }));
}

test("frozen calibration artifact has provenance, explicit splits, and eight profiles", () => {
  assert.equal(CALIBRATION_QUERY_LOG.length, 8);
  assert.equal(CALIBRATION_QUERY_LOG.filter((query) => query.split === "locked-holdout").length, 2);
  for (const query of CALIBRATION_QUERY_LOG) {
    for (const judgment of query.judgments) {
      assert.match(judgment.opportunityId, /^grants-\d+$/);
      assert.match(judgment.sourceId, /^\d+$/);
      assert.equal(judgment.opportunityId, `grants-${judgment.sourceId}`);
      assert.match(judgment.sourceUrl, /^https:\/\/www\.grants\.gov\//);
      assert.equal(judgment.retrievedAt, "2026-08-14T00:00:00.000Z");
      assert.match(judgment.provenanceHash, /^[a-f0-9]{64}$/);
    }
  }
});

test("cached production recommendations meet calibration recall and precision gates", async () => {
  const positiveCalibration = CALIBRATION_QUERY_LOG.filter(
    (query) => query.split === "calibration"
      && query.judgments.some((judgment) => judgment.relevant),
  );
  assert.equal(positiveCalibration.length, 3);

  const observations = await Promise.all(
    positiveCalibration.map(async (query) => ({
      query,
      result: await runCachedPipeline(query),
    })),
  );
  for (const { query, result } of observations) {
    const returnedOpportunityIds = new Set(
      result.discovery.recommendations.map(
        (recommendation) => recommendation.opportunity.id,
      ),
    );
    assert.ok(
      [...relevantOpportunityIds(query)].some((opportunityId) =>
        returnedOpportunityIds.has(opportunityId)),
      `${query.profileKey} did not retrieve a frozen relevant opportunity`,
    );
  }

  const returned = observations.flatMap(({ query, result }) =>
    recommendationLabels(query, result));
  assert.ok(returned.length > 0);
  const relevantReturned = returned.filter(
    ({ judgment }) => judgment?.relevant === true,
  ).length;
  const weightedPrecisionAt10 = relevantReturned / returned.length;
  console.log("cached calibration", JSON.stringify({
    profiles: positiveCalibration.length,
    returnedRecommendations: returned.length,
    relevantRecommendations: relevantReturned,
    weightedPrecisionAt10,
  }));
  assert.ok(
    weightedPrecisionAt10 >= 0.60,
    `weighted precision@10 ${weightedPrecisionAt10.toFixed(2)} is below 0.60`,
  );
});

test("cached production pipeline protects the positive and negative holdouts", async () => {
  const positiveHoldouts = CALIBRATION_QUERY_LOG.filter(
    (query) => query.split === "locked-holdout"
      && query.judgments.some((judgment) => judgment.relevant),
  );
  assert.equal(positiveHoldouts.length, 1);
  for (const query of positiveHoldouts) {
    const result = await runCachedPipeline(query);
    const returnedOpportunityIds = new Set(
      result.discovery.recommendations.map(
        (recommendation) => recommendation.opportunity.id,
      ),
    );
    assert.ok(
      [...relevantOpportunityIds(query)].some((opportunityId) =>
        returnedOpportunityIds.has(opportunityId)),
      `${query.profileKey} did not retrieve its frozen relevant holdout`,
    );
  }

  const negativeQueries = CALIBRATION_QUERY_LOG.filter(
    (query) => !query.judgments.some((judgment) => judgment.relevant),
  );
  assert.deepEqual(
    negativeQueries.map((query) => query.profileKey).sort(),
    [
      "consumer",
      "holdout-bookkeeping",
      "holdout-dog-grooming",
      "holdout-staffing",
    ],
  );
  for (const query of negativeQueries) {
    assert.ok(query.judgments.every((judgment) => !judgment.actionable));
    const result = await runCachedPipeline(query);
    assert.equal(
      result.discovery.recommendations.length,
      0,
      `${query.profileKey} received an actionable recommendation`,
    );
  }
});
