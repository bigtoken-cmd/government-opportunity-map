import assert from "node:assert/strict";
import test from "node:test";
import { discoverOpportunities } from "../src/lib/opportunity-discovery";
import { rankOpportunities } from "../src/lib/opportunity-matching";
import { searchGovernmentSources } from "../src/lib/opportunity-search";
import type { CompanyProfile } from "../src/lib/opportunity-types";
import {
  enrichGrantRecords,
  normalizeGrantsDetailPayload,
} from "../src/lib/sources/grants";
import type { CurrentOpportunityRecord } from "../src/lib/sources/source-contracts";

const source = {
  sourceId: "362396",
  sourceName: "Grants.gov public opportunity APIs",
  sourceUrl: "https://www.grants.gov/search-results-detail/362396",
  retrievedAt: "2026-08-15T12:00:00.000Z",
  factState: "current" as const,
  snapshotStatus: "live" as const,
};

const company = {
  id: "water-startup",
  name: "Water Startup",
  description: "Municipal water sensor research for public utilities.",
  missionAreas: ["water resilience", "municipal infrastructure", "technology commercialization"],
  exactTerms: ["municipal water"],
  controlledConcepts: ["water efficiency", "technical innovation", "commercialization"],
  technologyAndRd: ["sensor R&D", "water analytics", "research and development"],
  customerUses: ["municipal utilities", "commercialization"],
  operatingGeographies: ["Utah", "United States"],
  targetAmount: { min: 1_000, max: 40_000_000, currency: "USD" },
  legalEntityTypes: ["for-profit"],
  applicantTypes: ["small business", "for-profit"],
  samRegistration: "yes",
  uei: "yes",
  usEntity: "yes",
  smallBusiness: "yes",
  requiredClearances: [],
  certifications: [],
  profileProvenance: {
    ...source,
    sourceId: "founder-water",
    sourceName: "Founder-confirmed company profile",
    sourceUrl: "https://water.example.com",
    factState: "unknown",
  },
} satisfies CompanyProfile;

function record(id: string, title = "Municipal water sensor research"): CurrentOpportunityRecord {
  return {
    kind: "current_opportunity",
    id: `grants-${id}`,
    opportunityNumber: `WATER-${id}`,
    title,
    agency: "Bureau of Reclamation",
    status: "posted",
    openDate: "2026-05-14",
    deadline: "2027-08-26",
    assistanceListings: [],
    description: "Municipal water sensor research for public utilities and water reclamation.",
    detailStatus: "not-requested",
    source: { ...source, sourceId: id, sourceUrl: `https://www.grants.gov/search-results-detail/${id}` },
  };
}

function detailPayload(id: string, overrides: Record<string, unknown> = {}) {
  return {
    errorcode: 0,
    data: {
      id: Number(id),
      opportunityNumber: `WATER-${id}`,
      opportunityTitle: "Municipal water sensor research",
      alns: [{ alnNumber: "15.504" }],
      synopsis: {
        agencyName: "Bureau of Reclamation",
        synopsisDesc: "Municipal water sensor research for public utilities and water reclamation.",
        responseDateStr: "2027-08-26-00-00-00",
        postingDateStr: "2026-05-14-00-00-00",
        applicantTypes: [{
          description: "Others (see text field entitled Additional Information on Eligibility for clarification)",
        }],
        applicantEligibilityDesc: [
          "Eligible Applicants include States, Tribes, municipalities, irrigation districts, water districts, and other organizations with water delivery authority.",
          "Applicants must be located in Arizona, Colorado, or Utah.",
          "Ineligible Applicants include foreign entities, individuals, and institutes of higher education.",
        ].join(" "),
        awardFloor: "1000",
        awardCeiling: "40000000",
        estimatedFunding: "40000000",
        numberOfAwards: "10",
        costSharing: true,
        fundingInstruments: [
          { description: "Cooperative Agreement" },
          { description: "Grant" },
        ],
        ...overrides,
      },
      assistURL: "",
    },
  };
}

test("official detail normalization preserves applicant, amount, deadline, and cost-share facts", () => {
  const normalized = normalizeGrantsDetailPayload(
    detailPayload("362396"),
    record("362396"),
    "2026-08-15T12:30:00.000Z",
  );
  assert.ok(normalized);
  assert.equal(normalized.detailStatus, "enriched");
  assert.deepEqual(normalized.assistanceListings, ["15.504"]);
  assert.equal(normalized.awardFloor, 1_000);
  assert.equal(normalized.awardCeiling, 40_000_000);
  assert.equal(normalized.costSharing, true);
  assert.deepEqual(normalized.fundingInstruments, ["Cooperative Agreement", "Grant"]);
  assert.equal(normalized.applicationRoute, undefined);
  assert.equal(normalized.deadline, "2027-08-26");
  assert.match(normalized.additionalEligibility ?? "", /water delivery authority/);
  assert.equal(normalized.source.retrievedAt, "2026-08-15T12:30:00.000Z");
});

test("zero-valued award placeholders remain unstated instead of becoming a $0 range", () => {
  const normalized = normalizeGrantsDetailPayload(
    detailPayload("400000", {
      awardFloor: 0,
      awardCeiling: "0",
      estimatedFunding: "$0",
    }),
    record("400000"),
    "2026-08-15T12:30:00.000Z",
  );
  assert.ok(normalized);
  assert.equal(normalized.awardFloor, undefined);
  assert.equal(normalized.awardCeiling, undefined);
  assert.equal(normalized.estimatedFunding, undefined);
});

test("Title XVI-style public-authority eligibility becomes a named partner route, never a direct startup fit", () => {
  const normalized = normalizeGrantsDetailPayload(
    detailPayload("362396"),
    record("362396"),
    "2026-08-15T12:30:00.000Z",
  );
  assert.ok(normalized);
  const discovery = discoverOpportunities(company, [normalized], rankOpportunities);
  const recommendation = discovery.recommendations[0];
  assert.ok(recommendation);
  assert.equal(recommendation.match.decision, "Partner-dependent");
  assert.equal(recommendation.intelligence.routeType, "partner");
  assert.match(recommendation.intelligence.decisionSummary, /eligible state government or local government partner/);
  assert.equal(recommendation.opportunity.amount?.max, 40_000_000);
  assert.equal(recommendation.opportunity.costShare, true);
  assert.ok(recommendation.opportunity.geographies.includes("Utah"));
  assert.equal(
    recommendation.opportunity.eligibility.applicantTypes?.includes("institution of higher education"),
    false,
    "the ineligible section must not be parsed as an eligible partner category",
  );
});

test("Water Resources Research Act-style institution eligibility is partner-dependent", () => {
  const base = record("400001", "Water Resources Research Act municipal water research");
  const normalized = normalizeGrantsDetailPayload(
    detailPayload("400001", {
      applicantTypes: [
        { description: "Public and State controlled institutions of higher education" },
        { description: "Private institutions of higher education" },
      ],
      applicantEligibilityDesc: "Eligible applicants are designated water resources research institutes at institutions of higher education.",
      costSharing: false,
    }),
    base,
    "2026-08-15T12:30:00.000Z",
  );
  assert.ok(normalized);
  const recommendation = discoverOpportunities(company, [normalized], rankOpportunities)
    .recommendations[0];
  assert.ok(recommendation);
  assert.equal(recommendation.match.decision, "Partner-dependent");
  assert.match(recommendation.intelligence.nextAction.text, /institution of higher education partner/);
});

test("an explicitly eligible small-business notice can remain a direct route", () => {
  const base = record("400002");
  const normalized = normalizeGrantsDetailPayload(
    detailPayload("400002", {
      applicantTypes: [
        { description: "Small businesses" },
        { description: "For profit organizations other than small businesses" },
      ],
      applicantEligibilityDesc: "Eligible applicants are U.S. small businesses and for-profit organizations.",
      costSharing: false,
    }),
    base,
    "2026-08-15T12:30:00.000Z",
  );
  assert.ok(normalized);
  const recommendation = discoverOpportunities(company, [normalized], rankOpportunities)
    .recommendations[0];
  assert.ok(recommendation);
  assert.equal(recommendation.match.decision, "Pursue now");
  assert.equal(recommendation.intelligence.routeType, "direct");
});

test("alternate negative eligibility wording cannot become a direct or partner recommendation", () => {
  const normalized = normalizeGrantsDetailPayload(
    detailPayload("400005", {
      applicantTypes: [{
        description: "Others (see text field entitled Additional Information on Eligibility for clarification)",
      }],
      applicantEligibilityDesc: "Eligible applicants include institutions of higher education. Small businesses cannot apply.",
      costSharing: false,
    }),
    record("400005"),
    "2026-08-15T12:30:00.000Z",
  );
  assert.ok(normalized);
  assert.equal(
    discoverOpportunities(company, [normalized], rankOpportunities).recommendations.length,
    0,
  );

  const nonSmallForProfitOnly = normalizeGrantsDetailPayload(
    detailPayload("400006", {
      applicantTypes: [{
        description: "For profit organizations other than small businesses",
      }],
      applicantEligibilityDesc: "",
      costSharing: false,
    }),
    record("400006"),
    "2026-08-15T12:30:00.000Z",
  );
  assert.ok(nonSmallForProfitOnly);
  assert.equal(
    discoverOpportunities(company, [nonSmallForProfitOnly], rankOpportunities).recommendations.length,
    0,
  );
});

test("the source-search pipeline enriches bounded candidates before final route classification", async () => {
  let detailCalls = 0;
  const searchFetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("api.grants.gov")) {
      return Response.json({
        errorcode: 0,
        data: {
          oppHits: [{
            id: "362396",
            number: "WATER-362396",
            title: "Municipal water sensor research",
            agency: "Bureau of Reclamation",
            openDate: "2026-05-14",
            closeDate: "2027-08-26",
            oppStatus: "posted",
            cfdaList: ["15.504"],
            synopsis: "Municipal water sensor research for public utilities and water reclamation.",
          }],
        },
      });
    }
    if (url.includes("usaspending.gov")) return Response.json({ results: [] });
    throw new Error(`Unexpected source URL: ${url}`);
  };
  const result = await searchGovernmentSources(company, {
    fetcher: searchFetcher,
    grantsDetailFetcher: async () => {
      detailCalls += 1;
      return Response.json(detailPayload("362396"));
    },
    now: () => new Date("2026-08-15T12:30:00.000Z"),
  });

  assert.equal(detailCalls, 1);
  assert.equal(result.discovery.recommendations[0]?.match.decision, "Partner-dependent");
  assert.equal(result.discovery.recommendations[0]?.opportunity.noticeDetailStatus, "enriched");
  assert.equal(result.discovery.resultMeta.returnedCount, 1);
});

test("query-diverse enrichment can rescue a generic search-result title with official scope", async () => {
  let detailCalls = 0;
  const result = await searchGovernmentSources(company, {
    fetcher: async (input) => {
      const url = String(input);
      if (url.includes("api.grants.gov")) {
        return Response.json({
          errorcode: 0,
          data: {
            oppHits: [{
              id: "400007",
              number: "GENERIC-400007",
              title: "Open Innovation Challenge",
              agency: "Bureau of Reclamation",
              openDate: "2026-05-14",
              closeDate: "2027-08-26",
              oppStatus: "posted",
              cfdaList: ["15.504"],
            }],
          },
        });
      }
      if (url.includes("usaspending.gov")) return Response.json({ results: [] });
      throw new Error(`Unexpected source URL: ${url}`);
    },
    grantsDetailFetcher: async () => {
      detailCalls += 1;
      const payload = detailPayload("400007");
      payload.data.opportunityTitle = "Open Innovation Challenge";
      return Response.json(payload);
    },
    now: () => new Date("2026-08-15T12:30:00.000Z"),
  });

  assert.equal(detailCalls, 1);
  assert.equal(result.discovery.recommendations[0]?.opportunity.id, "grants-400007");
  assert.equal(result.discovery.recommendations[0]?.match.scopeDomainMatch, true);
});

test("rejected generic titles cannot spend a 24-record detail budget", async () => {
  let searchIndex = 0;
  let detailCalls = 0;
  const result = await searchGovernmentSources(company, {
    fetcher: async (input) => {
      const url = String(input);
      if (url.includes("api.grants.gov")) {
        const queryIndex = searchIndex;
        searchIndex += 1;
        return Response.json({
          errorcode: 0,
          data: {
            oppHits: Array.from({ length: 5 }, (_, index) => ({
              id: String(500_000 + (queryIndex * 10) + index),
              number: `GENERIC-${queryIndex}-${index}`,
              title: `Open Challenge ${queryIndex}-${index}`,
              agency: "Test Agency",
              openDate: "2026-05-14",
              closeDate: "2027-08-26",
              oppStatus: "posted",
              cfdaList: [],
            })),
          },
        });
      }
      if (url.includes("usaspending.gov")) return Response.json({ results: [] });
      throw new Error(`Unexpected source URL: ${url}`);
    },
    grantsDetailFetcher: async () => {
      detailCalls += 1;
      return new Response("unavailable", { status: 503 });
    },
  });

  assert.ok(detailCalls <= 3);
  assert.equal(result.discovery.recommendations.length, 0);
});

test("bounded detail failures stay explicit instead of fabricating notice facts", async () => {
  const records = [record("400003"), record("400004")];
  const result = await enrichGrantRecords(records, {
    fetcher: async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { opportunityId: number };
      return body.opportunityId === 400003
        ? Response.json(detailPayload("400003"))
        : new Response("upstream failure", { status: 503 });
    },
    now: () => new Date("2026-08-15T12:30:00.000Z"),
    concurrency: 2,
  });
  assert.equal(result.enrichedCount, 1);
  assert.equal(result.records[0].detailStatus, "enriched");
  assert.equal(result.records[1].detailStatus, "unavailable");
  assert.match(result.warning ?? "", /1 of 2/);

  const uncertain = discoverOpportunities(company, [result.records[1]], rankOpportunities)
    .recommendations[0];
  assert.ok(uncertain);
  assert.equal(uncertain.match.decision, "Verify first");
  assert.ok(uncertain.match.unknownCriticalFacts.includes("exact notice applicant type"));
});
