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

test("manual evidence-only intake leaves unsupported company facts blank", () => {
  const profile = createEvidenceOnlyFounderProfile("We build AI software for hospitals.");
  assert.equal(profile.description, "We build AI software for hospitals.");
  assert.equal(profile.revenue, "");
  assert.equal(profile.capitalRaised, "");
  assert.equal(profile.applicantType, "");
  assert.equal(profile.samStatus, "");
});

test("evidence-only intake infers specific profile fields without inventing adjacent industries", () => {
  const profile = createEvidenceOnlyFounderProfile(
    "We provide expert human reasoning data for physical AI teams training robot policies with VLA models.",
  );
  assert.equal(profile.industry, "Physical AI and robotics");
  assert.match(profile.technology, /physical ai/);
  assert.match(profile.technology, /robot learning/);
  assert.equal(profile.industry.includes("manufacturing"), false);
});

test("ambiguous phrases do not synthesize a physical-AI company", () => {
  for (const evidence of [
    "World models for macroeconomic forecasting.",
    "Preference data from consumer surveys and an evaluation suite.",
    "Metaphysical AI research for philosophy students.",
    "Sports teams training for regional competitions.",
    "Robotic process automation services for invoice entry.",
    "A retailer selling robot toys and hobby kits.",
  ]) {
    const concepts = normalizeConcepts(evidence);
    assert.equal(concepts.missionAreas.includes("robotics and autonomous systems"), false, evidence);
    assert.equal(concepts.controlledConcepts.includes("robot learning"), false, evidence);
    assert.equal(concepts.controlledConcepts.includes("AI training data"), false, evidence);
    assert.equal(concepts.customerUses.includes("robotics developers"), false, evidence);
  }
});

test("physical-AI evidence produces specific source queries rather than generic AI noise", () => {
  const company = normalizeFounderProfile({
    id: "physical-ai",
    companyName: "Physical AI Company",
    website: "",
    description: "Expert human reasoning data for physical AI teams training robot policies with VLA models.",
    industry: "Physical AI and robotics",
    technology: "robotics training data",
    location: "",
    capitalNeed: "",
    useOfFunds: "",
    customers: "robotics developers",
    researchActivities: "",
    applicantType: "Unknown",
    samStatus: "Unknown",
    uei: "",
  });
  const terms = buildSearchQueries(company).map(({ term }) => term);
  assert.ok(terms.includes("physical ai"));
  assert.ok(terms.includes("robotics"));
  assert.ok(terms.includes("robot learning"));
  assert.ok(terms.includes("AI training data"));
  assert.ok(terms.includes("robotics R&D"));
  assert.equal(terms.includes("artificial intelligence"), false);
});

test("founder location aliases normalize deterministically for matching", () => {
  const company = normalizeFounderProfile({
    id: "slc-company",
    companyName: "SLC Company",
    website: "",
    description: "Advanced manufacturing systems.",
    industry: "Advanced manufacturing",
    technology: "Manufacturing process R&D",
    location: "slc",
    capitalNeed: "",
    useOfFunds: "",
    customers: "",
    researchActivities: "",
    applicantType: "Unknown",
    samStatus: "Unknown",
    uei: "",
  });
  assert.deepEqual(company.operatingGeographies, ["Utah", "United States"]);
});

test("current form values map into amount and eligibility contracts", () => {
  const company = normalizeFounderProfile({
    id: "form-contract",
    companyName: "Form Contract Co.",
    website: "https://example.com",
    description: "Builds municipal water sensors for public utilities.",
    industry: "Water and environmental services",
    technology: "Water sensors",
    location: "Salt Lake City, UT",
    yearFounded: "2021",
    employees: "3–10 people",
    revenue: "$750,000 last year",
    capitalRaised: "$1.2 million",
    capitalNeed: "$100,000–$500,000",
    useOfFunds: "Prototype development and field testing",
    customers: "Public utilities",
    researchActivities: "Sensor validation",
    applicantType: "University or research institution",
    legalEntityType: "Nonprofit corporation",
    ownership: "Founder-owned",
    productStage: "Prototype",
    researchStage: "Validation or field testing",
    smallBusinessStatus: "No",
    usEntityStatus: "Yes",
    samStatus: "Active",
    uei: "ABC123456789",
  });

  assert.deepEqual(company.targetAmount, {
    min: 100_000,
    max: 500_000,
    currency: "USD",
  });
  assert.deepEqual(company.applicantTypes, ["nonprofit", "institution of higher education"]);
  assert.deepEqual(company.legalEntityTypes, ["nonprofit", "corporation"]);
  assert.equal(company.smallBusiness, "no");
  assert.equal(company.usEntity, "yes");
  assert.equal(company.samRegistration, "yes");
  assert.equal(company.uei, "yes");
  assert.equal(company.founderFacts?.productStage, "Prototype");
  assert.equal(company.founderFacts?.researchStage, "Validation or field testing");
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

test("one broad manufacturing phrase does not synthesize independent domain groups", () => {
  const controlled = normalizeConcepts("manufacturing innovation");
  assert.deepEqual(controlled.missionAreas, []);
  assert.deepEqual(controlled.technologyAndRd, []);
  assert.deepEqual(controlled.customerUses, []);
  assert.deepEqual(controlled.controlledConcepts, ["manufacturing innovation"]);

  const issuerContext = normalizeConcepts(
    "The USAF School of Aerospace Medicine supports advanced manufacturing systems research.",
  );
  assert.ok(issuerContext.missionAreas.includes("advanced manufacturing"));
  assert.equal(issuerContext.missionAreas.includes("biomedical research"), false);

  const humanPerformance = normalizeConcepts(
    "The Human Effectiveness Directorate and School of Aerospace Medicine study continuing human enabling and restoring research.",
  );
  assert.ok(humanPerformance.missionAreas.includes("aerospace"));
  assert.ok(humanPerformance.missionAreas.includes("biomedical research"));
  assert.equal(humanPerformance.missionAreas.includes("advanced manufacturing"), false);
  assert.equal(humanPerformance.technologyAndRd.includes("materials R&D"), false);
  assert.equal(humanPerformance.customerUses.includes("aerospace manufacturing"), false);
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
    { term: "municipal utilities", family: "customer" },
    { term: "water resilience", family: "mission" },
    { term: "small business innovation research", family: "technology" },
    { term: "sensor R&D", family: "technology" },
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
    "municipal utilities",
    "water resilience",
    "small business innovation research",
    "sensor R&D",
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

  assert.equal(grantsRequest, 6);
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
