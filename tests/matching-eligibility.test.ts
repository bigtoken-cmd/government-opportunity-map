import assert from "node:assert/strict";
import test from "node:test";
import { matchOpportunity, rankOpportunities } from "../src/lib/opportunity-matching";
import type { CompanyProfile, Opportunity } from "../src/lib/opportunity-types";

const source = {
  sourceId: "official",
  sourceName: "Official source",
  sourceUrl: "https://example.gov/official",
  retrievedAt: "2026-08-14T00:00:00.000Z",
  factState: "current" as const,
  snapshotStatus: "live" as const,
};

const company = {
  id: "company",
  name: "Company",
  description: "",
  missionAreas: ["water resilience"],
  exactTerms: ["municipal water"],
  controlledConcepts: ["water efficiency"],
  technologyAndRd: ["sensor R&D"],
  customerUses: [],
  operatingGeographies: ["United States"],
  targetAmount: { min: 100_000, max: 200_000, currency: "USD" },
  legalEntityTypes: ["for-profit"],
  applicantTypes: ["small business"],
  samRegistration: "unknown",
  uei: "unknown",
  usEntity: "yes",
  smallBusiness: "yes",
  requiredClearances: [],
  certifications: [],
  profileProvenance: { ...source, sourceId: "founder", factState: "unknown" },
} satisfies CompanyProfile;

function opportunity(overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "opportunity",
    title: "Municipal water research",
    recordKind: "opportunity",
    agency: "Agency",
    opportunityStatus: "open",
    deadline: "2026-09-01",
    amount: { min: 200_000, max: 300_000, currency: "USD" },
    missionAreas: ["water resilience"],
    exactTerms: ["municipal water"],
    controlledConcepts: ["water efficiency"],
    technologyAndRd: ["sensor R&D"],
    customerUses: [],
    geographies: ["United States"],
    eligibility: { samRegistration: true },
    source,
    ...overrides,
  };
}

test("unknown critical eligibility caps an otherwise strong match", () => {
  const result = matchOpportunity(company, opportunity());
  assert.equal(result.fitStatus, "Potential Fit");
  assert.equal(result.decision, "Verify first");
});

test("hard eligibility failure cannot be rescued by thematic score", () => {
  const result = matchOpportunity(
    company,
    opportunity({ eligibility: { applicantTypes: ["nonprofit"] } }),
  );
  assert.equal(result.fitStatus, "No Fit");
  assert.equal(result.decision, "Skip");
});

test("exact terms and controlled synonyms receive separate score evidence", () => {
  const exact = matchOpportunity(company, opportunity());
  const synonymOnly = matchOpportunity(
    { ...company, exactTerms: [] },
    opportunity({ exactTerms: [] }),
  );
  assert.ok(exact.score.exactTerms > synonymOnly.score.exactTerms);
  assert.equal(synonymOnly.score.controlledConcepts, 15);
});

test("deadline breaks ties without changing fit score", () => {
  const later = opportunity({ id: "later", deadline: "2026-10-01" });
  const earlier = opportunity({ id: "earlier", deadline: "2026-09-01" });
  const ranked = rankOpportunities({ ...company, samRegistration: "yes" }, [later, earlier]);
  assert.deepEqual(ranked.map((result) => result.opportunityId), ["earlier", "later"]);
  assert.equal(ranked[0].score.total, ranked[1].score.total);
});
