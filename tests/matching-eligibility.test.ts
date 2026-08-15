import assert from "node:assert/strict";
import test from "node:test";
import { normalizeConcepts } from "../src/lib/concept-normalization";
import { normalizeFounderProfile } from "../src/lib/intake/profile-normalization";
import {
  matchOpportunity,
  rankOpportunities,
  scoreOpportunity,
} from "../src/lib/opportunity-matching";
import type { CompanyProfile, Opportunity } from "../src/lib/opportunity-types";
import {
  ADVERSARIAL_HOLDOUTS,
  OFFICIAL_PROFILE_FIXTURES,
  type OfficialProfileKey,
} from "./fixtures/official-profile-fixtures";
import {
  AUDITED_MANUFACTURING_FALSE_POSITIVES,
  PROTECTED_DOMAIN_POSITIVES,
  type MatchingRegressionCase,
} from "./fixtures/matching-regression-cases";

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

function regressionOpportunity(input: MatchingRegressionCase): Opportunity {
  const concepts = normalizeConcepts(`${input.title} ${input.scopeSummary}`);
  return opportunity({
    id: input.key,
    title: input.title,
    scopeSummary: input.scopeSummary,
    titleConcepts: normalizeConcepts(input.title),
    ...concepts,
    eligibility: { applicantTypes: ["small business"] },
    source: { ...source, sourceUrl: input.sourceUrl },
  });
}

function officialCompany(key: OfficialProfileKey): CompanyProfile {
  const fixture = OFFICIAL_PROFILE_FIXTURES.find((item) => item.key === key);
  assert.ok(fixture);
  return normalizeFounderProfile(fixture.profile);
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
      scopeSummary: "This notice supports municipal water research.",
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

test("audited biomechanics and CHEERS scopes cannot become direct manufacturing routes", () => {
  const manufacturingCompany = officialCompany("manufacturing");
  for (const input of AUDITED_MANUFACTURING_FALSE_POSITIVES) {
    const result = matchOpportunity(manufacturingCompany, regressionOpportunity(input));
    assert.equal(result.decision, "Skip", input.key);
    assert.equal(result.fitStatus, "No Fit", input.key);
  }
});

test("an incidental specialized issuer mention cannot erase explicit manufacturing scope", () => {
  const manufacturingCompany = officialCompany("manufacturing");
  const title = "Advanced Manufacturing Systems";
  const scopeSummary = "The USAF School of Aerospace Medicine is the issuing organization. Work must advance manufacturing systems and materials processing for aerospace suppliers.";
  const candidate = regressionOpportunity({
    key: "manufacturing-with-specialized-issuer",
    opportunityNumber: "GENERAL",
    title,
    scopeSummary,
    sourceUrl: source.sourceUrl,
  });
  const result = matchOpportunity(
    manufacturingCompany,
    {
      ...candidate,
      amount: { min: 2_000_000, max: 5_000_000, currency: "USD" },
    },
  );
  assert.equal(result.titleDomainMatch, true);
  assert.equal(result.scopeDomainMatch, true);
  assert.equal(result.decision, "Pursue now");
});

test("one broad scope phrase cannot masquerade as independent manufacturing evidence", () => {
  const manufacturingCompany = officialCompany("manufacturing");
  const title = "Open Technical Research Areas";
  const scopeSummary = "This open notice supports aerospace research and development across all technical areas.";
  const result = matchOpportunity(
    manufacturingCompany,
    regressionOpportunity({
      key: "broad-scope-only",
      opportunityNumber: "GENERAL",
      title,
      scopeSummary,
      sourceUrl: source.sourceUrl,
    }),
  );
  assert.equal(result.titleDomainMatch, false);
  assert.equal(result.scopeDomainMatch, true);
  assert.notEqual(result.decision, "Pursue now");
  assert.notEqual(result.fitStatus, "Strong Fit");
});

test("independent non-generic title and scope anchors can still support a direct route", () => {
  const manufacturingCompany = officialCompany("manufacturing");
  const title = "Aerospace Systems Research";
  const scopeSummary = "Lightweight component manufacturing-process development for aerospace suppliers.";
  const anchoredOpportunity = regressionOpportunity({
    key: "independent-manufacturing-anchors",
    opportunityNumber: "GENERAL",
    title,
    scopeSummary,
    sourceUrl: source.sourceUrl,
  });
  const result = matchOpportunity(
    manufacturingCompany,
    {
      ...anchoredOpportunity,
      amount: { min: 2_000_000, max: 5_000_000, currency: "USD" },
    },
  );
  assert.equal(result.titleDomainMatch, true);
  assert.equal(result.scopeDomainMatch, true);
  assert.equal(result.decision, "Pursue now");
});

test("official manufacturing, water, and cyber positives preserve their intended routes", () => {
  for (const input of PROTECTED_DOMAIN_POSITIVES) {
    const candidate = regressionOpportunity(input);
    const route = input.profileKey === "manufacturing"
      ? {
          decision: "Pursue now" as const,
          fitStatus: "Strong Fit" as const,
          eligibility: { applicantTypes: ["small business"] },
        }
      : input.profileKey === "water"
        ? {
            decision: "Partner-dependent" as const,
            fitStatus: "Potential Fit" as const,
            eligibility: {
              applicantTypes: ["municipal government"],
              partnerMaySatisfy: ["applicantType" as const],
            },
          }
        : {
            decision: "Verify first" as const,
            fitStatus: "Potential Fit" as const,
            eligibility: { unverifiedCriticalFields: ["exact notice applicant type"] },
          };
    const result = matchOpportunity(
      officialCompany(input.profileKey),
      { ...candidate, eligibility: route.eligibility },
    );
    assert.equal(result.decision, route.decision, input.key);
    assert.equal(result.fitStatus, route.fitStatus, input.key);
  }
});

test("consumer and service holdouts stay no-match on generic research language", () => {
  const consumerFixture = OFFICIAL_PROFILE_FIXTURES.find((item) => item.key === "consumer");
  assert.ok(consumerFixture);
  const holdouts = [consumerFixture.profile, ...ADVERSARIAL_HOLDOUTS];
  const genericOpportunity = regressionOpportunity({
    key: "generic-commercialization",
    opportunityNumber: "GENERAL",
    title: "Small Business Research and Commercialization",
    scopeSummary: "Broad support for research and development, technical innovation, and commercialization.",
    sourceUrl: source.sourceUrl,
  });
  for (const profile of holdouts) {
    const result = matchOpportunity(normalizeFounderProfile(profile), genericOpportunity);
    assert.equal(result.decision, "Skip", profile.id);
  }
});

test("one broad group stays out even when amount and geography inflate its score", () => {
  const cases: Array<{ profile: CompanyProfile; candidate: Opportunity }> = [
    {
      profile: {
        ...company,
        missionAreas: ["advanced manufacturing"],
        exactTerms: [],
        controlledConcepts: [],
        technologyAndRd: [],
        customerUses: [],
        samRegistration: "yes",
      },
      candidate: opportunity({
        title: "Advanced Manufacturing Challenge",
        titleConcepts: normalizeConcepts("Advanced Manufacturing Challenge"),
        missionAreas: ["advanced manufacturing"],
        exactTerms: [],
        controlledConcepts: [],
        technologyAndRd: [],
        customerUses: [],
        eligibility: {},
      }),
    },
    {
      profile: {
        ...company,
        missionAreas: [],
        exactTerms: [],
        controlledConcepts: ["manufacturing innovation"],
        technologyAndRd: [],
        customerUses: [],
        samRegistration: "yes",
      },
      candidate: opportunity({
        title: "Manufacturing Innovation Challenge",
        titleConcepts: normalizeConcepts("Manufacturing Innovation Challenge"),
        missionAreas: [],
        exactTerms: [],
        controlledConcepts: ["manufacturing innovation"],
        technologyAndRd: [],
        customerUses: [],
        eligibility: {},
      }),
    },
    {
      profile: {
        ...company,
        missionAreas: [],
        exactTerms: [],
        controlledConcepts: [],
        technologyAndRd: [],
        customerUses: ["municipal utilities"],
        samRegistration: "yes",
      },
      candidate: opportunity({
        title: "Municipal Utilities Challenge",
        titleConcepts: normalizeConcepts("Municipal Utilities Challenge"),
        missionAreas: [],
        exactTerms: [],
        controlledConcepts: [],
        technologyAndRd: [],
        customerUses: ["municipal utilities"],
        eligibility: {},
      }),
    },
  ];
  for (const { profile, candidate } of cases) {
    const result = matchOpportunity(profile, candidate);
    assert.equal(result.decision, "Skip", candidate.title);
    assert.equal(result.fitStatus, "No Fit", candidate.title);
  }
});

test("score is invariant to duplicate, case, and whitespace variants", () => {
  const duplicateCompany: CompanyProfile = {
    ...company,
    missionAreas: ["water resilience", " WATER RESILIENCE "],
    exactTerms: ["municipal water", "Municipal Water"],
    controlledConcepts: ["water efficiency", " water efficiency "],
    technologyAndRd: ["sensor R&D", "SENSOR R&D"],
    operatingGeographies: ["United States", " united states "],
  };
  const duplicateOpportunity = opportunity({
    missionAreas: ["water resilience", "Water Resilience"],
    exactTerms: ["municipal water", " municipal water "],
    controlledConcepts: ["water efficiency", "Water Efficiency"],
    technologyAndRd: ["sensor R&D", "sensor r&d"],
    geographies: ["United States", "UNITED STATES"],
  });
  assert.deepEqual(
    scoreOpportunity(duplicateCompany, duplicateOpportunity),
    scoreOpportunity(company, opportunity()),
  );
});

test("score uses both notice coverage and company focus instead of coarse all-or-nothing buckets", () => {
  const focused = matchOpportunity({ ...company, samRegistration: "yes" }, opportunity({ eligibility: {} }));
  const broadProfile: CompanyProfile = {
    ...company,
    samRegistration: "yes",
    missionAreas: ["water resilience", "aerospace", "cybersecurity", "healthcare delivery"],
    exactTerms: ["municipal water", "robotics"],
    controlledConcepts: [
      "water efficiency",
      "robot learning",
      "AI training data",
      "cyber resilience",
      "hospital innovation",
    ],
    technologyAndRd: ["sensor R&D", "robotics R&D", "software R&D"],
    operatingGeographies: ["United States", "Utah", "Colorado"],
  };
  const broad = matchOpportunity(broadProfile, opportunity({ eligibility: {} }));

  assert.ok(focused.score.total > broad.score.total);
  assert.ok(broad.score.total >= 0 && broad.score.total <= 100);
  assert.notEqual(broad.score.total % 5, 0);
});

test("one specific anchored concept can survive as a cautious Watch result", () => {
  const sparseCompany: CompanyProfile = {
    ...company,
    missionAreas: [],
    exactTerms: ["municipal water"],
    controlledConcepts: [],
    technologyAndRd: [],
    customerUses: [],
    operatingGeographies: [],
    targetAmount: undefined,
    samRegistration: "yes",
  };
  const title = "Municipal water challenge";
  const result = matchOpportunity(sparseCompany, opportunity({
    title,
    titleConcepts: normalizeConcepts(title),
    missionAreas: [],
    exactTerms: ["municipal water"],
    controlledConcepts: [],
    technologyAndRd: [],
    customerUses: [],
    geographies: [],
    amount: undefined,
    eligibility: {},
  }));

  assert.equal(result.score.total, 20);
  assert.equal(result.decision, "Watch");
  assert.equal(result.fitStatus, "Potential Fit");
});

test("equal scores prefer fewer unknown facts before deadline and ID", () => {
  const unknown = opportunity({
    id: "a-unknown",
    deadline: "2026-09-01",
    eligibility: { unverifiedCriticalFields: ["exact applicant type"] },
  });
  const known = opportunity({ id: "z-known", deadline: "2026-09-01", eligibility: {} });
  const ranked = rankOpportunities({ ...company, samRegistration: "yes" }, [unknown, known]);
  assert.deepEqual(ranked.map((result) => result.opportunityId), ["z-known", "a-unknown"]);
  assert.equal(ranked[0].score.total, ranked[1].score.total);
});

test("deadline breaks ties without changing fit score", () => {
  const later = opportunity({ id: "later", deadline: "2026-10-01" });
  const earlier = opportunity({ id: "earlier", deadline: "2026-09-01" });
  const ranked = rankOpportunities({ ...company, samRegistration: "yes" }, [later, earlier]);
  assert.deepEqual(ranked.map((result) => result.opportunityId), ["earlier", "later"]);
  assert.equal(ranked[0].score.total, ranked[1].score.total);
});
