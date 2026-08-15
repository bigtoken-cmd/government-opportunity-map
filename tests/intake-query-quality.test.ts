import assert from "node:assert/strict";
import test from "node:test";
import { normalizeConcepts } from "../src/lib/concept-normalization";
import {
  createEvidenceOnlyFounderProfile,
  normalizeFounderProfile,
} from "../src/lib/intake/profile-normalization";
import {
  buildSearchQueries,
  searchGovernmentSources,
} from "../src/lib/opportunity-search";
import type { AssistanceListingsStore } from "../src/lib/sources/assistance-listings-store";
import type { SbirAwardsStore } from "../src/lib/sources/sbir-store";

test("manual evidence-only intake preserves unsupported company facts as unknown", () => {
  const profile = createEvidenceOnlyFounderProfile("We build AI software for hospitals.");
  assert.equal(profile.description, "We build AI software for hospitals.");
  assert.equal(profile.revenue, "");
  assert.equal(profile.capitalRaised, "");
  assert.equal(profile.applicantType, "Unknown — founder input needed");
  assert.equal(profile.samStatus, "Unknown");
});

test("generic AI language does not create a source query by itself", async () => {
  const company = normalizeFounderProfile({
    id: "generic-ai",
    companyName: "Generic AI",
    website: "",
    description: "Artificial intelligence technology platform.",
    industry: "",
    technology: "",
    location: "",
    capitalNeed: "",
    useOfFunds: "",
    customers: "",
    researchActivities: "",
    applicantType: "Unknown",
    samStatus: "Unknown",
    uei: "",
  });
  assert.deepEqual(buildSearchQueries(company), []);
  const result = await searchGovernmentSources(company, { mode: "cached" });
  assert.equal(result.query.keyword, "");
  assert.equal(result.discovery.recommendations.length, 0);
});

test("controlled synonyms remain distinct from direct terms", () => {
  const concepts = normalizeConcepts("municipal water sensor research");
  assert.ok(concepts.exactTerms.includes("municipal water"));
  assert.ok(concepts.controlledConcepts.includes("water efficiency"));
  assert.notEqual(concepts.exactTerms[0], concepts.controlledConcepts[0]);
});

test("controlled query terms do not synthesize exact-term evidence", () => {
  const water = normalizeConcepts("water efficiency");
  const manufacturing = normalizeConcepts("manufacturing innovation");
  const cyber = normalizeConcepts("cyber resilience");

  assert.deepEqual(water.exactTerms, []);
  assert.deepEqual(manufacturing.exactTerms, []);
  assert.deepEqual(cyber.exactTerms, []);
  assert.ok(water.controlledConcepts.includes("water efficiency"));
  assert.ok(manufacturing.controlledConcepts.includes("manufacturing innovation"));
  assert.ok(cyber.controlledConcepts.includes("cyber resilience"));
});

test("direct concept terms do not receive synonym credit without synonym evidence", () => {
  const water = normalizeConcepts("municipal water");
  const manufacturing = normalizeConcepts("advanced manufacturing");
  const cyber = normalizeConcepts("cybersecurity");

  assert.deepEqual(water.exactTerms, ["municipal water"]);
  assert.deepEqual(manufacturing.exactTerms, ["advanced manufacturing"]);
  assert.deepEqual(cyber.exactTerms, ["cybersecurity"]);
  assert.deepEqual(water.controlledConcepts, []);
  assert.deepEqual(manufacturing.controlledConcepts, []);
  assert.deepEqual(cyber.controlledConcepts, []);
});

test("grouped source queries are bounded, noise-filtered, and deduplicated", async () => {
  const company = normalizeFounderProfile({
    id: "grouped-water",
    companyName: "Grouped Water",
    website: "",
    description: "Municipal water sensor research and analytics.",
    industry: "Water technology",
    technology: "Water sensors",
    location: "Utah, United States",
    capitalNeed: "",
    useOfFunds: "Product development",
    customers: "Municipal utilities",
    researchActivities: "Sensor R&D",
    applicantType: "U.S. for-profit small business",
    samStatus: "Unknown",
    uei: "",
  });
  assert.deepEqual(buildSearchQueries(company), [
    { term: "municipal water", family: "exact" },
    { term: "water efficiency", family: "controlled" },
  ]);

  const grantKeywords: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("grants.gov")) {
      const body = JSON.parse(String(init?.body)) as { keyword: string };
      grantKeywords.push(body.keyword);
      return Response.json({
        errorcode: 0,
        data: {
          oppHits: [{
            id: "grouped-1",
            number: "GROUPED-1",
            title: "Municipal water sensor research",
            agency: "Test agency",
            openDate: "2026-01-01",
            closeDate: "2027-01-01",
            oppStatus: "posted",
            cfdaList: ["15.504"],
            synopsis: "Research to improve municipal water efficiency.",
          }],
        },
      });
    }
    if (url.includes("usaspending.gov")) {
      return Response.json({ results: [] });
    }
    throw new Error(`Unexpected source request: ${url}`);
  };

  const result = await searchGovernmentSources(company, {
    fetcher,
    now: () => new Date("2026-08-14T00:00:00.000Z"),
  });

  assert.deepEqual(grantKeywords, [
    "municipal water",
    "water efficiency",
  ]);
  assert.equal(result.query.keyword, "municipal water");
  assert.equal(result.sources[0].status, "live");
  assert.equal(result.sources[0].recordCount, 1);
  assert.equal(result.discovery.recommendations.length, 1);
});

test("a partial grouped-query failure does not hide validated live records", async () => {
  const company = normalizeFounderProfile({
    id: "partial-water",
    companyName: "Partial Water",
    website: "",
    description: "Municipal water sensor research.",
    industry: "Water technology",
    technology: "",
    location: "Utah, United States",
    capitalNeed: "",
    useOfFunds: "",
    customers: "Municipal utilities",
    researchActivities: "Research and development",
    applicantType: "U.S. for-profit small business",
    samStatus: "Unknown",
    uei: "",
  });
  let grantsRequest = 0;
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("grants.gov")) {
      grantsRequest += 1;
      return grantsRequest === 1
        ? Response.json({
          errorcode: 0,
          data: {
            oppHits: [{
              id: "partial-1",
              number: "PARTIAL-1",
              title: "Municipal water research",
              agency: "Test agency",
              oppStatus: "posted",
              cfdaList: ["15.504"],
            }],
          },
        })
        : Response.json({ errorcode: 0, data: {} });
    }
    if (url.includes("usaspending.gov")) {
      return Response.json({ results: [] });
    }
    throw new Error(`Unexpected source request: ${url}`);
  };

  const result = await searchGovernmentSources(company, { fetcher });
  const grants = result.sources.find((source) => source.family === "grants");

  assert.equal(grantsRequest, 2);
  assert.equal(grants?.status, "live");
  assert.equal(grants?.recordCount, 1);
  assert.match(grants?.warning ?? "", /malformed or incomplete response/i);
});

test("store failures do not discard validated Grants records or reject the search", async () => {
  const company = normalizeFounderProfile({
    id: "store-failure-water",
    companyName: "Store Failure Water",
    website: "",
    description: "Municipal water research.",
    industry: "",
    technology: "",
    location: "Utah, United States",
    capitalNeed: "",
    useOfFunds: "",
    customers: "",
    researchActivities: "",
    applicantType: "U.S. for-profit small business",
    samStatus: "Unknown",
    uei: "",
  });
  const failingAssistanceStore = {
    metadata: async () => {
      throw new Error("assistance store unavailable");
    },
  } as unknown as AssistanceListingsStore;
  const failingSbirStore = {
    metadata: async () => {
      throw new Error("SBIR store unavailable");
    },
  } as unknown as SbirAwardsStore;
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("grants.gov")) {
      return Response.json({
        errorcode: 0,
        data: {
          oppHits: [{
            id: "store-failure-1",
            number: "STORE-FAILURE-1",
            title: "Municipal water research",
            agency: "Test agency",
            openDate: "2026-01-01",
            closeDate: "2027-01-01",
            oppStatus: "posted",
            cfdaList: ["93.310"],
            synopsis: "Municipal water research.",
          }],
        },
      });
    }
    if (url.includes("usaspending.gov")) {
      return Response.json({ results: [] });
    }
    throw new Error(`Unexpected source request: ${url}`);
  };

  const result = await searchGovernmentSources(company, {
    fetcher,
    assistanceListingsStore: failingAssistanceStore,
    sbirAwardsStore: failingSbirStore,
  });

  assert.equal(result.sources.find((source) => source.family === "grants")?.status, "live");
  assert.equal(result.sources.find((source) => source.family === "grants")?.recordCount, 1);
  assert.equal(
    result.sources.find((source) => source.family === "assistance-listings")?.status,
    "cached-fallback",
  );
  assert.equal(result.sources.find((source) => source.family === "sbir")?.status, "unavailable");
  assert.equal(result.discovery.recommendations[0]?.opportunity.id, "grants-store-failure-1");
});
