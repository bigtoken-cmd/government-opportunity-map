import assert from "node:assert/strict";
import test from "node:test";
import { normalizeConcepts } from "../src/lib/concept-normalization";
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

test("municipal watersheds do not synthesize the exact municipal-water term", () => {
  const concepts = normalizeConcepts("wildfire impacts on municipal watersheds");
  assert.equal(concepts.exactTerms.includes("municipal water"), false);
  assert.equal(concepts.missionAreas.includes("water resilience"), false);
});

test("generic research and commercialization overlap cannot pad unrelated titles", () => {
  const result = matchOpportunity(
    {
      ...company,
      missionAreas: ["water resilience", "technology commercialization"],
      controlledConcepts: ["water efficiency", "technical innovation", "commercialization"],
      technologyAndRd: ["sensor R&D", "research and development"],
      customerUses: ["commercialization"],
      samRegistration: "yes",
    },
    opportunity({
      title: "Increasing Market Opportunities for Biofertilizer Exporters",
      missionAreas: ["technology commercialization"],
      exactTerms: [],
      controlledConcepts: ["technical innovation", "commercialization"],
      technologyAndRd: ["research and development"],
      customerUses: ["commercialization"],
      eligibility: { applicantTypes: ["small business"] },
    }),
  );
  assert.equal(result.titleDomainMatch, false);
  assert.equal(result.fitStatus, "No Fit");
  assert.equal(result.decision, "Skip");
});

test("an exact synopsis term can rescue a valid opportunity with a generic title", () => {
  const result = matchOpportunity(
    { ...company, samRegistration: "yes" },
    opportunity({
      title: "Technical Assistance Challenge",
      eligibility: { applicantTypes: ["small business"] },
    }),
  );
  assert.equal(result.titleDomainMatch, false);
  assert.equal(result.scopeExactTermMatch, true);
  assert.notEqual(result.decision, "Skip");
});

test("oncology and precision-medicine titles do not become hospital-operations fits", () => {
  const healthcareCompany = {
    ...company,
    ...normalizeConcepts([
      "Healthcare software for hospital administrative work and nurse workflow automation.",
      "Artificial intelligence, health IT, software R&D, and hospital pilot validation.",
    ].join(" ")),
  };
  const title = "Community Oncology Research Program Clinical Trial";
  const result = matchOpportunity(
    healthcareCompany,
    opportunity({
      title,
      ...normalizeConcepts(`${title} healthcare clinical research for cancer patients`),
      titleConcepts: normalizeConcepts(title),
      eligibility: { applicantTypes: ["small business", "for-profit"] },
    }),
  );
  assert.equal(result.titleDomainMatch, false);
  assert.equal(result.scopeExactTermMatch, false);
  assert.equal(result.decision, "Skip");
});

test("a generic small-business title requires non-generic official scope evidence", () => {
  const healthcareCompany = {
    ...company,
    ...normalizeConcepts(
      "Healthcare software for hospital operations with software research and development.",
    ),
  };
  const title = "Small Business Innovation Research Parent Program Clinical Trial Optional";
  const result = matchOpportunity(
    healthcareCompany,
    opportunity({
      title,
      scopeSummary: "This notice supports healthcare software for hospital operations.",
      ...normalizeConcepts(`${title} healthcare software for hospital operations`),
      titleConcepts: normalizeConcepts(title),
      eligibility: { applicantTypes: ["small business"] },
    }),
  );
  assert.equal(result.titleDomainMatch, false);
  assert.equal(result.scopeDomainMatch, true);
  assert.notEqual(result.decision, "Skip");
});

test("a generic small-business title and generic commercialization scope are not enough", () => {
  const manufacturingCompany = {
    ...company,
    ...normalizeConcepts(
      "Advanced manufacturing for aerospace with materials research and development.",
    ),
  };
  const title = "Small Business Innovation Research Parent Program";
  const result = matchOpportunity(
    manufacturingCompany,
    opportunity({
      title,
      scopeSummary: "Supports scientific innovation, research and development, and commercialization.",
      ...normalizeConcepts(`${title} scientific innovation and commercialization`),
      titleConcepts: normalizeConcepts(title),
      eligibility: { applicantTypes: ["small business"] },
    }),
  );
  assert.equal(result.titleDomainMatch, false);
  assert.equal(result.scopeDomainMatch, false);
  assert.equal(result.decision, "Skip");
});

test("a cybersecurity company does not match an education-first title on cyber alone", () => {
  const cyberCompany = {
    ...company,
    ...normalizeConcepts(
      "Cybersecurity threat detection and security analytics R&D for small organizations.",
    ),
  };
  const title = "Artificial Intelligence and Cybersecurity Education Innovation and Scholarship for Service";
  const result = matchOpportunity(
    cyberCompany,
    opportunity({
      title,
      ...normalizeConcepts(title),
      titleConcepts: normalizeConcepts(title),
      eligibility: { applicantTypes: ["small business"] },
    }),
  );
  assert.equal(result.titleDomainMatch, false);
  assert.equal(result.decision, "Skip");
});

test("deadline breaks ties without changing fit score", () => {
  const later = opportunity({ id: "later", deadline: "2026-10-01" });
  const earlier = opportunity({ id: "earlier", deadline: "2026-09-01" });
  const ranked = rankOpportunities({ ...company, samRegistration: "yes" }, [later, earlier]);
  assert.deepEqual(ranked.map((result) => result.opportunityId), ["earlier", "later"]);
  assert.equal(ranked[0].score.total, ranked[1].score.total);
});
