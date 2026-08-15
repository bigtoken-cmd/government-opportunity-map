import assert from "node:assert/strict";
import test from "node:test";
import { CALIBRATION_QUERY_LOG, type CalibrationJudgment } from "./fixtures/calibration-query-log";

type Distribution = {
  name: string;
  direct: number;
  synonym: number;
  broadMission: number;
};

const DISTRIBUTIONS: readonly Distribution[] = [
  { name: "current", direct: 20, synonym: 15, broadMission: 25 },
  { name: "synonym-forward", direct: 15, synonym: 20, broadMission: 25 },
  { name: "direct-forward", direct: 25, synonym: 15, broadMission: 20 },
];

function score(judgment: CalibrationJudgment, distribution: Distribution) {
  return judgment.direct * distribution.direct
    + judgment.synonym * distribution.synonym
    + judgment.broadMission * distribution.broadMission;
}

function metrics(distribution: Distribution) {
  const positiveCalibration = CALIBRATION_QUERY_LOG.filter(
    (query) => query.split === "calibration" && query.judgments.some((judgment) => judgment.relevant),
  );
  const positiveHoldout = CALIBRATION_QUERY_LOG.filter(
    (query) => query.split === "locked-holdout" && query.judgments.some((judgment) => judgment.relevant),
  );
  const negativeQueries = CALIBRATION_QUERY_LOG.filter(
    (query) => !query.judgments.some((judgment) => judgment.relevant),
  );
  const ranked = (query: typeof CALIBRATION_QUERY_LOG[number]) =>
    [...query.judgments].sort((left, right) => score(right, distribution) - score(left, distribution));
  const recallAt20 = (queries: typeof CALIBRATION_QUERY_LOG) =>
    queries.filter((query) => query.judgments.some((judgment) => judgment.relevant))
      .filter((query) => ranked(query).slice(0, 20).some((judgment) => judgment.relevant)).length
      / queries.filter((query) => query.judgments.some((judgment) => judgment.relevant)).length;
  const weightedPrecisionAt10 = (queries: typeof CALIBRATION_QUERY_LOG) => {
    const top = queries.flatMap((query) => ranked(query).slice(0, 10));
    return top.length
      ? top.reduce((total, judgment) => total + (judgment.relevant ? 2 : 0), 0) / (top.length * 2)
      : 0;
  };
  const positiveScores = [...positiveCalibration, ...positiveHoldout]
    .map((query) => Math.max(...ranked(query).map((judgment) => score(judgment, distribution))));
  const negativeScores = negativeQueries.map((query) =>
    Math.max(...ranked(query).map((judgment) => score(judgment, distribution))));

  return {
    recallAt20: recallAt20(positiveCalibration),
    weightedPrecisionAt10: weightedPrecisionAt10(positiveCalibration),
    perProfileFloor: Math.min(...positiveScores.map((value) => value > 0 ? 1 : 0)),
    positiveNegativeSeparation: Math.min(...positiveScores) - Math.max(...negativeScores),
    lockedPositiveRecallAt20: recallAt20(positiveHoldout),
    lockedNegativeActionable: negativeQueries
      .filter((query) => query.split === "locked-holdout")
      .filter((query) => ranked(query).slice(0, 20).some((judgment) => judgment.actionable)).length,
    actionableNegatives: negativeQueries
      .filter((query) => ranked(query).slice(0, 20).some((judgment) => judgment.actionable)).length,
  };
}

test("frozen calibration artifact has provenance, explicit splits, and eight profiles", () => {
  assert.equal(CALIBRATION_QUERY_LOG.length, 8);
  assert.equal(CALIBRATION_QUERY_LOG.filter((query) => query.split === "locked-holdout").length, 2);
  for (const query of CALIBRATION_QUERY_LOG) {
    for (const judgment of query.judgments) {
      assert.match(judgment.sourceId, /^grants-/);
      assert.match(judgment.sourceUrl, /^https:\/\/www\.grants\.gov\//);
      assert.equal(judgment.retrievedAt, "2026-08-14T00:00:00.000Z");
      assert.match(judgment.provenanceHash, /^[a-f0-9]{64}$/);
    }
  }
});

test("calibration compares only predefined distributions and protects the locked holdout", () => {
  const results = DISTRIBUTIONS.map((distribution) => ({
    distribution: distribution.name,
    metrics: metrics(distribution),
  }));
  console.log("calibration", JSON.stringify(results));

  for (const result of results) {
    assert.equal(result.metrics.recallAt20, 1);
    assert.equal(result.metrics.weightedPrecisionAt10, 0.5);
    assert.equal(result.metrics.perProfileFloor, 1);
    assert.ok(result.metrics.positiveNegativeSeparation > 0);
    assert.equal(result.metrics.lockedPositiveRecallAt20, 1);
    assert.equal(result.metrics.lockedNegativeActionable, 0);
    assert.equal(result.metrics.actionableNegatives, 0);
  }
  assert.deepEqual(
    results.map((result) => result.metrics),
    results.map((result) => result.metrics),
  );
  assert.equal(
    results.reduce((best, result) =>
      result.metrics.weightedPrecisionAt10 > best.metrics.weightedPrecisionAt10 ? result : best,
    ).distribution,
    "current",
  );
});

test("term-family ablations preserve zero actionable negatives and direct/synonym separation", () => {
  const current = DISTRIBUTIONS[0];
  for (const family of ["direct", "synonym", "broadMission"] as const) {
    const ablated = { ...current, [family]: 0 };
    const negativeQueries = CALIBRATION_QUERY_LOG.filter(
      (query) => !query.judgments.some((judgment) => judgment.relevant),
    );
    assert.equal(
      negativeQueries.filter((query) =>
        query.judgments.some((judgment) => judgment.actionable && score(judgment, ablated) > 0),
      ).length,
      0,
    );
  }
  assert.ok(score({ direct: 1, synonym: 0, broadMission: 0 } as CalibrationJudgment, current)
    > score({ direct: 0, synonym: 1, broadMission: 0 } as CalibrationJudgment, current));
  assert.notEqual(current.direct, current.synonym);
});
