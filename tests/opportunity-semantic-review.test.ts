import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFounderProfile } from "../src/lib/intake/profile-normalization";
import {
  reviewOpportunitySemantics,
  type OpportunitySemanticReviewInput,
} from "../src/lib/opportunity-semantic-review";
import type { OpportunityDiscovery } from "../src/lib/opportunity-discovery";
import { searchGovernmentSources } from "../src/lib/opportunity-search";
import { opportunitySearchResponseV2Fixture } from "./fixtures/opportunity-search-response-v2";

function completedResponse(reviews: unknown) {
  return Response.json({
    status: "completed",
    error: null,
    incomplete_details: null,
    output: [{
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{
        type: "output_text",
        text: JSON.stringify({ reviews }),
        annotations: [],
        logprobs: [],
      }],
    }],
  });
}

function input(): OpportunitySemanticReviewInput {
  const discovery = structuredClone(
    opportunitySearchResponseV2Fixture.discovery,
  ) as OpportunityDiscovery;
  const recommendation = discovery.recommendations[0];
  recommendation.opportunity.scopeSummary =
    "The pilot funds resilient infrastructure monitoring for public agencies.";
  return {
    company: normalizeFounderProfile({
      id: "fixture-company",
      companyName: "Fixture Company",
      website: "",
      description: "We build resilient infrastructure monitoring for public agencies.",
      industry: "Infrastructure technology",
      technology: "Monitoring software",
      location: "Utah, United States",
      capitalNeed: "$100K-$250K",
      useOfFunds: "Public agency pilot",
      customers: "Public agencies",
      researchActivities: "Product research and development",
      applicantType: "U.S. for-profit small business",
      legalEntityType: "for-profit corporation",
      smallBusinessStatus: "yes",
      usEntityStatus: "yes",
      samStatus: "Unknown",
      uei: "",
    }),
    discovery,
  };
}

function review(alignment: "strong" | "partial" | "weak") {
  return {
    opportunityId: "fixture-opportunity-1",
    alignment,
    companyEvidenceIds: ["company-description-1"],
    opportunityEvidenceIds: ["notice-1-title"],
    mismatchCodes: alignment === "strong" ? [] : ["generic_domain_overlap_only"],
  };
}

test("one valid batched review preserves strong matches and uses selected exact evidence", async () => {
  let calls = 0;
  const result = await reviewOpportunitySemantics(input(), {
    apiKey: "test-only-key",
    fetcher: async (_input, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "gpt-5.6-luna");
      assert.equal(body.store, false);
      assert.doesNotMatch(body.instructions, /decide eligibility/i);
      const packet = JSON.parse(body.input[0].content[0].text) as {
        companyEvidence: Array<{ id: string; text: string }>;
      };
      const companyEvidence = Object.fromEntries(
        packet.companyEvidence.map(({ id, text }) => [id, text]),
      );
      assert.match(companyEvidence["company-technology"], /Monitoring software/);
      assert.match(companyEvidence["company-customers"], /Public agencies/);
      assert.match(companyEvidence["company-researchActivities"], /Product research and development/);
      assert.equal(companyEvidence["company-location"], undefined);
      return completedResponse([review("strong")]);
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.processing.completed, true);
  assert.equal(result.processing.strongCount, 1);
  const recommendation = result.discovery.recommendations[0];
  assert.equal(recommendation.match.score.total, 85);
  assert.equal(recommendation.match.effectiveScore, 85);
  assert.equal(recommendation.match.semanticReview?.alignment, "strong");
  assert.match(recommendation.intelligence.whyFit[0].companyFact, /resilient infrastructure monitoring/);
  assert.match(recommendation.intelligence.whyFit[0].opportunityFact, /Resilient Infrastructure Pilot/);
});

test("one Luna batch reviews every displayed recommendation up to the twenty-result cap", async () => {
  const value = input();
  const base = value.discovery.recommendations[0];
  value.discovery = {
    ...value.discovery,
    recommendations: Array.from({ length: 20 }, (_, index) => {
      const recommendation = structuredClone(base);
      const id = `fixture-opportunity-${index + 1}`;
      recommendation.opportunity.id = id;
      recommendation.opportunity.title = `Resilient Infrastructure Pilot ${index + 1}`;
      recommendation.match.opportunityId = id;
      return recommendation;
    }),
    resultMeta: {
      ...value.discovery.resultMeta,
      qualifyingCount: 20,
      returnedCount: 20,
    },
  };
  let calls = 0;
  const result = await reviewOpportunitySemantics(value, {
    apiKey: "test-only-key",
    fetcher: async (_input, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body));
      const packet = JSON.parse(body.input[0].content[0].text) as {
        companyEvidence: Array<{ id: string }>;
        opportunities: Array<{
          opportunityId: string;
          noticeEvidence: Array<{ id: string }>;
        }>;
      };
      assert.equal(packet.opportunities.length, 20);
      return completedResponse(packet.opportunities.map((opportunity) => ({
        opportunityId: opportunity.opportunityId,
        alignment: "strong",
        companyEvidenceIds: [packet.companyEvidence[0].id],
        opportunityEvidenceIds: [opportunity.noticeEvidence[0].id],
        mismatchCodes: [],
      })));
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.processing.reviewedCount, 20);
  assert.equal(result.discovery.recommendations.length, 20);
  assert.ok(result.discovery.recommendations.every(
    (recommendation) => recommendation.match.semanticReview?.alignment === "strong",
  ));
});

test("partial alignment can only lower certainty through a deterministic cap", async () => {
  const value = input();
  value.discovery.recommendations[0].match.decision = "Pursue now";
  value.discovery.recommendations[0].match.fitStatus = "Strong Fit";
  const result = await reviewOpportunitySemantics(value, {
    apiKey: "test-only-key",
    fetcher: async () => completedResponse([review("partial")]),
  });

  const recommendation = result.discovery.recommendations[0];
  assert.equal(recommendation.match.score.total, 85);
  assert.equal(recommendation.match.effectiveScore, 69);
  assert.equal(recommendation.match.decision, "Verify first");
  assert.equal(recommendation.match.fitStatus, "Potential Fit");
  assert.ok(recommendation.match.unknownCriticalFacts.includes("semantic scope alignment"));
  assert.match(recommendation.intelligence.concerns[0].text, /broad domain level/);
});

test("weak semantic alignment removes a result but cannot create or upgrade one", async () => {
  const value = input();
  const result = await reviewOpportunitySemantics(value, {
    apiKey: "test-only-key",
    fetcher: async () => completedResponse([review("weak")]),
  });

  assert.equal(result.processing.weakCount, 1);
  assert.equal(result.discovery.recommendations.length, 0);
  assert.equal(result.discovery.resultMeta.returnedCount, 0);
});

test("an uncited weak label cannot remove a deterministic result", async () => {
  const value = input();
  const uncited = {
    ...review("weak"),
    companyEvidenceIds: [],
    opportunityEvidenceIds: [],
  };
  const result = await reviewOpportunitySemantics(value, {
    apiKey: "test-only-key",
    fetcher: async () => completedResponse([uncited]),
  });

  assert.equal(result.processing.reason, "schema_failure");
  assert.deepEqual(result.discovery, value.discovery);
});

test("invalid evidence IDs reject the whole model result and preserve deterministic ranking", async () => {
  const value = input();
  const invalid = {
    ...review("strong"),
    opportunityEvidenceIds: ["invented-notice-id"],
  };
  const result = await reviewOpportunitySemantics(value, {
    apiKey: "test-only-key",
    fetcher: async () => completedResponse([invalid]),
  });

  assert.equal(result.processing.completed, false);
  assert.equal(result.processing.reason, "schema_failure");
  assert.deepEqual(result.discovery, value.discovery);
});

test("search orchestration exposes review failure without changing deterministic results", async () => {
  const company = normalizeFounderProfile({
    id: "semantic-water",
    companyName: "Semantic Water",
    website: "",
    description: "Municipal water sensors for public utilities.",
    industry: "Water technology",
    technology: "Water sensors",
    location: "Utah, United States",
    capitalNeed: "$100K-$250K",
    useOfFunds: "Product research",
    customers: "Municipal utilities",
    researchActivities: "Sensor R&D",
    applicantType: "U.S. for-profit small business",
    smallBusinessStatus: "yes",
    usEntityStatus: "yes",
    samStatus: "Unknown",
    uei: "",
  });
  const deterministic = await searchGovernmentSources(company, { mode: "cached" });
  const reviewed = await searchGovernmentSources(company, {
    mode: "cached",
    semanticReview: {
      apiKey: "",
    },
  });

  assert.deepEqual(reviewed.discovery, deterministic.discovery);
  assert.equal(reviewed.semanticReview?.reason, "missing_api_key");
  assert.match(reviewed.externalProcessingDisclosure ?? "", /sent to OpenAI/);
  assert.match(reviewed.warnings.at(-1) ?? "", /deterministic ranking was preserved/);
});

test("provider authorization failure prevents paid egress and preserves deterministic ranking", async () => {
  let providerCalls = 0;
  const value = input();
  const result = await reviewOpportunitySemantics(value, {
    apiKey: "test-only-key",
    authorizeProviderRequest: async () => "rate_limited",
    fetcher: async () => {
      providerCalls += 1;
      return completedResponse([review("strong")]);
    },
  });

  assert.equal(providerCalls, 0);
  assert.equal(result.processing.reason, "rate_limited");
  assert.deepEqual(result.discovery, value.discovery);
});

test("provider timeout preserves the deterministic fallback", async () => {
  const value = input();
  const result = await reviewOpportunitySemantics(value, {
    apiKey: "test-only-key",
    timeoutMs: 5,
    fetcher: async () => new Promise<Response>(() => undefined),
  });

  assert.equal(result.processing.completed, false);
  assert.equal(result.processing.reason, "timeout");
  assert.deepEqual(result.discovery, value.discovery);
});
