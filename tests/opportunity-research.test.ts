import assert from "node:assert/strict";
import test from "node:test";
import { discoverOpportunities } from "../src/lib/opportunity-discovery";
import { rankOpportunities } from "../src/lib/opportunity-matching";
import { researchReturnedOpportunities } from "../src/lib/opportunity-research-agent";
import type { CompanyProfile } from "../src/lib/opportunity-types";
import type { CurrentOpportunityRecord } from "../src/lib/sources/source-contracts";

const source = {
  sourceId: "400002",
  sourceName: "Grants.gov public opportunity APIs",
  sourceUrl: "https://www.grants.gov/search-results-detail/400002",
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

function record(id: string): CurrentOpportunityRecord {
  return {
    kind: "current_opportunity",
    id: `grants-${id}`,
    opportunityNumber: `WATER-${id}`,
    title: "Municipal water sensor research",
    agency: "Bureau of Reclamation",
    status: "posted",
    openDate: "2026-05-14",
    deadline: "2027-08-26",
    assistanceListings: ["15.504"],
    description: "Municipal water sensor research for public utilities and water reclamation.",
    detailStatus: "enriched",
    eligibleApplicantTypes: ["Small businesses", "For profit organizations other than small businesses"],
    additionalEligibility: "Eligible applicants are U.S. small businesses and for-profit organizations.",
    awardCeiling: 400000,
    costSharing: false,
    source: { ...source, sourceId: id, sourceUrl: `https://www.grants.gov/search-results-detail/${id}` },
  };
}

test("research attaches listing prefill and official similar opportunities to every returned card", async () => {
  const current = record("400002");
  const discovery = discoverOpportunities(company, [current], rankOpportunities);
  assert.ok(discovery.recommendations.length >= 1);

  const researched = await researchReturnedOpportunities(company, discovery, [current], {
    fetcher: async (input) => {
      const url = String(input);
      if (url.includes("search-results-detail/400002")) {
        return new Response(`
          <h2>Similar Opportunities (identified by AI)</h2>
          <a href="/search-results-detail/400099">Related water research</a>
        `, { headers: { "content-type": "text/html" } });
      }
      if (url.includes("fetchOpportunity")) {
        return Response.json({
          errorcode: 0,
          data: {
            id: 400099,
            opportunityNumber: "WATER-400099",
            opportunityTitle: "Related municipal water research",
            alns: [{ alnNumber: "15.504" }],
            synopsis: {
              agencyName: "Bureau of Reclamation",
              synopsisDesc: "Municipal water sensor research for public utilities.",
              responseDateStr: "2027-08-26-00-00-00",
              postingDateStr: "2026-05-14-00-00-00",
              applicantTypes: [{ description: "Small businesses" }],
              applicantEligibilityDesc: "Eligible applicants are U.S. small businesses and for-profit organizations.",
              awardCeiling: "100000",
              costSharing: false,
            },
          },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
    now: () => new Date("2026-08-15T12:30:00.000Z"),
  });

  const card = researched.discovery.recommendations.find((item) => item.opportunity.id === "grants-400002");
  assert.ok(card);
  assert.ok((card.listingPrefillFields?.length ?? 0) > 0);
  assert.equal(card.similarOpportunities?.[0]?.id, "grants-400099");
  assert.equal(card.similarOpportunities?.[0]?.title, "Related municipal water research");
  assert.equal(researched.researchPass.attempted, true);
});
