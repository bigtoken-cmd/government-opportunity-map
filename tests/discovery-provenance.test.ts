import assert from "node:assert/strict";
import test from "node:test";
import { discoverOpportunities } from "../src/lib/opportunity-discovery";
import type { CompanyProfile, MatchResult } from "../src/lib/opportunity-types";
import type { CurrentOpportunityRecord } from "../src/lib/sources/source-contracts";

const company = {
  id: "company",
  name: "Company",
  description: "Water research",
  missionAreas: ["water resilience"],
  exactTerms: ["municipal water"],
  controlledConcepts: [],
  technologyAndRd: [],
  customerUses: [],
  operatingGeographies: [],
  legalEntityTypes: [],
  applicantTypes: [],
  samRegistration: "unknown",
  uei: "unknown",
  usEntity: "unknown",
  smallBusiness: "unknown",
  requiredClearances: [],
  certifications: [],
  profileProvenance: {
    sourceId: "founder",
    sourceName: "Founder",
    sourceUrl: "https://example.com",
    retrievedAt: "2026-08-14T00:00:00.000Z",
    factState: "unknown",
    snapshotStatus: "live",
  },
} satisfies CompanyProfile;

function record(index: number): CurrentOpportunityRecord {
  return {
    kind: "current_opportunity",
    id: `record-${index}`,
    opportunityNumber: `N-${index}`,
    title: `Municipal water research ${index}`,
    agency: "Agency",
    status: "posted",
    openDate: "2026-08-01",
    deadline: "2026-09-01",
    assistanceListings: [],
    description: "Water research",
    source: {
      sourceId: `${index}`,
      sourceName: "Official source",
      sourceUrl: `https://example.gov/${index}`,
      retrievedAt: "2026-08-14T00:00:00.000Z",
      factState: "current",
      snapshotStatus: "live",
    },
  };
}

test("discovery returns at most five actionable current opportunities by default", () => {
  const records = Array.from({ length: 25 }, (_, index) => record(index));
  const result = discoverOpportunities(
    company,
    records,
    (_company, opportunities) => opportunities.map((opportunity): MatchResult => ({
      companyId: "company",
      opportunityId: opportunity.id,
      fitStatus: "Potential Fit",
      decision: "Watch",
      score: { mission: 25, exactTerms: 20, controlledConcepts: 0, technologyAndRd: 0, customerUse: 0, amount: 0, geography: 0, total: 45 },
      eligibility: [],
      matchedConceptGroups: ["mission", "exact terms"],
      unknownCriticalFacts: [],
      reason: "Deterministic evidence.",
    })),
  );

  assert.equal(result.recommendations.length, 5);
  assert.ok(result.recommendations.every((item) => item.opportunity.source.sourceId));
});
