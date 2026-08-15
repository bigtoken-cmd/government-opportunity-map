import assert from "node:assert/strict";
import test from "node:test";
import { createOpportunityExplanation } from "../src/lib/opportunity-explanation";
import { matchOpportunity } from "../src/lib/opportunity-matching";
import type { CompanyProfile, Opportunity } from "../src/lib/opportunity-types";

const company = {
  id: "company",
  name: "Company",
  description: "Water sensors",
  missionAreas: ["water resilience"],
  exactTerms: ["municipal water"],
  controlledConcepts: ["water efficiency"],
  technologyAndRd: ["sensor R&D"],
  customerUses: ["municipal utilities"],
  operatingGeographies: ["United States"],
  legalEntityTypes: ["for-profit"],
  applicantTypes: ["small business"],
  samRegistration: "unknown",
  uei: "unknown",
  usEntity: "yes",
  smallBusiness: "yes",
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

const opportunity = {
  id: "water",
  title: "Water research",
  recordKind: "opportunity",
  agency: "Agency",
  opportunityStatus: "open",
  missionAreas: ["water resilience"],
  exactTerms: ["municipal water"],
  controlledConcepts: ["water efficiency"],
  technologyAndRd: ["sensor R&D"],
  customerUses: ["municipal utilities"],
  geographies: [],
  eligibility: { samRegistration: true },
  source: {
    sourceId: "official-1",
    sourceName: "Official source",
    sourceUrl: "https://example.gov/official-1",
    retrievedAt: "2026-08-14T00:00:00.000Z",
    factState: "current",
    snapshotStatus: "live",
  },
} satisfies Opportunity;

test("explanations are deterministic and use only match evidence", () => {
  const match = matchOpportunity(company, opportunity);
  const first = createOpportunityExplanation(opportunity, match);
  const second = createOpportunityExplanation(opportunity, match);

  assert.deepEqual(first, second);
  assert.deepEqual(first.matchedGroups, match.matchedConceptGroups);
  assert.deepEqual(first.eligibility, match.eligibility);
  assert.deepEqual(first.source, opportunity.source);
  assert.equal(JSON.stringify(first).includes(company.name), false);
});
