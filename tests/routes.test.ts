import assert from "node:assert/strict";
import test from "node:test";
import { POST as search } from "../src/app/api/opportunities/search/route";
import { createWebsitePost } from "../src/lib/intake/website-route-handler";
import type { SourceResultStatus } from "../src/lib/sources/source-contracts";

const SOURCE_STATUS_VOCABULARY: Record<SourceResultStatus, true> = {
  live: true,
  cached: true,
  "cached-fallback": true,
  unavailable: true,
};

function sortedKeys(value: object) {
  return Object.keys(value).sort();
}

function lunaResponse(claims: unknown) {
  return new Response(JSON.stringify({
    status: "completed",
    incomplete_details: null,
    output: [{
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{
        type: "output_text",
        text: JSON.stringify({ claims }),
      }],
    }],
  }), {
    headers: { "content-type": "application/json" },
  });
}

test("search route rejects malformed JSON", async () => {
  const response = await search(new Request("https://example.test/api/opportunities/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Request body must be valid JSON." });
});

test("search route rejects a missing confirmed description", async () => {
  const response = await search(new Request("https://example.test/api/opportunities/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: { companyName: "Missing description" }, mode: "cached" }),
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "A confirmed company description is required." });
});

test("cached search returns role-separated records and source warnings", async () => {
  const response = await search(new Request("https://example.test/api/opportunities/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "cached",
      profile: {
        id: "route-water",
        companyName: "Water company",
        description: "Municipal water sensor research.",
        industry: "",
        technology: "",
        location: "Utah, United States",
        capitalNeed: "",
        useOfFunds: "",
        customers: "",
        researchActivities: "Research and development",
        applicantType: "U.S. for-profit small business",
        samStatus: "Unknown",
        uei: "",
      },
    }),
  }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(
    sortedKeys(body),
    ["discovery", "query", "sources", "warnings"],
  );
  assert.deepEqual(
    sortedKeys(body.query),
    ["assistanceListing", "keyword"],
  );
  assert.deepEqual(
    sortedKeys(body.discovery),
    ["historicalAwards", "programs", "recommendations"],
  );
  assert.equal(body.sources.length, 4);
  assert.deepEqual(
    body.sources.map((source: { family: string }) => source.family),
    ["grants", "assistance-listings", "usaspending", "sbir"],
  );
  for (const source of body.sources) {
    assert.deepEqual(
      sortedKeys(source),
      [
        "family",
        "name",
        "recordCount",
        "retrievedAt",
        "sourceUrl",
        "status",
        "warning",
      ],
    );
    assert.equal(SOURCE_STATUS_VOCABULARY[source.status as SourceResultStatus], true);
    assert.equal(typeof source.recordCount, "number");
    assert.ok(source.warning);
  }
  assert.ok(body.discovery.recommendations.length > 0);
  for (const recommendation of body.discovery.recommendations) {
    assert.deepEqual(
      sortedKeys(recommendation),
      ["match", "opportunity"],
    );
    assert.deepEqual(
      sortedKeys(recommendation.match),
      [
        "companyId",
        "decision",
        "eligibility",
        "fitStatus",
        "matchedConceptGroups",
        "opportunityId",
        "reason",
        "score",
        "unknownCriticalFacts",
      ],
    );
    assert.deepEqual(
      sortedKeys(recommendation.match.score),
      [
        "amount",
        "controlledConcepts",
        "customerUse",
        "exactTerms",
        "geography",
        "mission",
        "technologyAndRd",
        "total",
      ],
    );
    assert.equal(
      recommendation.match.opportunityId,
      recommendation.opportunity.id,
    );
    assert.ok(
      ["Strong Fit", "Potential Fit", "No Fit"].includes(
        recommendation.match.fitStatus,
      ),
    );
  }
  assert.ok(body.discovery.recommendations.every(
    (item: { opportunity: { recordKind: string } }) => item.opportunity.recordKind === "opportunity",
  ));
  assert.ok(body.discovery.programs.every((item: { kind: string }) => item.kind === "program_context"));
  assert.ok(body.discovery.historicalAwards.every((item: { kind: string }) => item.kind === "historical_award"));
});

test("website intake returns evidence-only fields from injected fetch", async () => {
  const post = createWebsitePost(async () => new Response(
    "<html><head><title>Water Works</title><meta name=\"description\" content=\"We reduce municipal water loss with sensors.\"></head><body></body></html>",
    {
      headers: {
        "content-type": "text/html",
      },
    },
  ));
  const response = await post(new Request("https://example.test/api/intake/website", {
    method: "POST",
    body: JSON.stringify({ url: "https://water.example.com" }),
    headers: { "Content-Type": "application/json" },
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.profile, {
    companyName: "Water Works",
    website: "https://water.example.com/",
    description: "We reduce municipal water loss with sensors.",
    industry: "Water technology",
    technology: "Water technology",
    yearFounded: "",
  });
  assert.deepEqual(body.evidence, [
    { field: "Company name", value: "Water Works", sourceUrl: "https://water.example.com/" },
    {
      field: "Company description",
      value: "We reduce municipal water loss with sensors.",
      sourceUrl: "https://water.example.com/",
    },
  ]);
  assert.match(body.warning, /Confirm every field/);
});

test("website intake invokes Luna only with explicit consent and returns disclosure", async () => {
  let providerCalls = 0;
  const post = createWebsitePost(
    async () => new Response(
      "<html><head><title>Acme Water Labs</title></head><body>Acme Water Labs builds municipal water sensors for public utilities.</body></html>",
      {
        headers: {
          "content-type": "text/html",
        },
      },
    ),
    {
      apiKey: "test-only-key",
      fetcher: async () => {
        providerCalls += 1;
        return lunaResponse([{
          field: "technology",
          value: "municipal water sensors",
          evidenceExcerpt: "builds municipal water sensors for public utilities",
        }]);
      },
    },
  );
  const response = await post(new Request("https://example.test/api/intake/website", {
    method: "POST",
    body: JSON.stringify({
      url: "https://water.example.com",
      externalProcessingConsent: true,
    }),
    headers: { "Content-Type": "application/json" },
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(providerCalls, 1);
  assert.equal(body.profile.technology, "municipal water sensors");
  assert.equal(body.externalProcessing.completed, true);
  assert.match(body.externalProcessingDisclosure, /sent to OpenAI/);
  assert.match(body.externalProcessingDisclosure, /does not decide eligibility/);
});
