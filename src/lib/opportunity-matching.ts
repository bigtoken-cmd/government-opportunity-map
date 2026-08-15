import { normalizeConcepts } from "./concept-normalization";
import type {
  CompanyProfile,
  DecisionLabel,
  EligibilityCheck,
  FitStatus,
  MatchResult,
  Opportunity,
  ScoreBreakdown,
} from "./opportunity-types";

const normalize = (value: string) => value.trim().toLocaleLowerCase("en-US");
const GENERIC_TITLE_CONCEPTS = new Set([
  "technology commercialization",
  "technical innovation",
  "commercialization",
  "research and development",
  "artificial intelligence",
  "software r&d",
]);
const BROAD_EXACT_TERMS = new Set([
  "healthcare",
  "artificial intelligence",
  "cybersecurity",
]);
const SPECIALIZED_MISSIONS = new Set([
  "biomedical research",
  "education and workforce",
]);
const setOf = (values: readonly string[]) => new Set(values.map(normalize));
const overlap = (left: readonly string[], right: readonly string[]) => {
  const normalizedLeft = setOf(left);
  return [...setOf(right)].filter((value) => normalizedLeft.has(value));
};
const hasAllowedValue = (available: readonly string[], allowed: readonly string[]) =>
  available.some((value) =>
    allowed.some((candidate) => {
      const normalizedValue = normalize(value);
      const normalizedCandidate = normalize(candidate);
      return (
        normalizedValue === normalizedCandidate ||
        normalizedValue.includes(normalizedCandidate) ||
        normalizedCandidate.includes(normalizedValue)
      );
    }),
  );
const ratioScore = (
  matched: number,
  opportunityConcepts: number,
  companyConcepts: number,
  weight: number,
) => {
  if (matched === 0 || opportunityConcepts === 0 || companyConcepts === 0) return 0;
  const opportunityCoverage = Math.min(1, matched / opportunityConcepts);
  const companyFocus = Math.min(1, matched / companyConcepts);
  return Math.round(weight * ((opportunityCoverage * 0.85) + (companyFocus * 0.15)));
};

function checkBoolean(
  field: string,
  companyValue: "yes" | "no" | "unknown",
  required: boolean | undefined,
): EligibilityCheck | undefined {
  if (!required) return undefined;
  if (companyValue === "yes") return { field, state: "pass", detail: `${field} confirmed` };
  if (companyValue === "unknown") return { field, state: "unknown", detail: `${field} is not verified` };
  return { field, state: "fail", detail: `${field} is required` };
}

/** Performs strict eligibility checks only. Unknowns are never treated as passes. */
export function evaluateEligibility(company: CompanyProfile, opportunity: Opportunity): EligibilityCheck[] {
  const requirements = opportunity.eligibility;
  const checks: EligibilityCheck[] = [];
  const add = (check: EligibilityCheck | undefined) => check && checks.push(check);
  const listCheck = (
    field: string,
    profileValues: readonly string[],
    requiredValues: readonly string[] | undefined,
    partnerKey?: "applicantType" | "legalEntityType" | "clearances" | "certifications" | "geography",
  ) => {
    if (!requiredValues?.length) return;
    const unknown =
      profileValues.length === 0 ||
      profileValues.some((value) => normalize(value) === "unknown");
    if (unknown) {
      checks.push({ field, state: "unknown", detail: `${field} is not verified` });
    } else if (hasAllowedValue(profileValues, requiredValues)) {
      checks.push({ field, state: "pass", detail: `${field} matches an allowed category` });
    } else if (partnerKey && requirements.partnerMaySatisfy?.includes(partnerKey)) {
      checks.push({ field, state: "partner", detail: `${field} requires an eligible partner` });
    } else {
      checks.push({ field, state: "fail", detail: `${field} requirement not met` });
    }
  };

  listCheck("applicant type", company.applicantTypes, requirements.applicantTypes, "applicantType");
  for (const excluded of requirements.excludedApplicantTypes ?? []) {
    if (hasAllowedValue(company.applicantTypes, [excluded])) {
      checks.push({
        field: "applicant type",
        state: "fail",
        detail: `${excluded} applicants are excluded by the notice`,
      });
    }
  }
  listCheck("legal entity type", company.legalEntityTypes, requirements.legalEntityTypes, "legalEntityType");
  add(checkBoolean("SAM registration", company.samRegistration, requirements.samRegistration));
  add(checkBoolean("UEI", company.uei, requirements.uei));
  add(checkBoolean("US entity", company.usEntity, requirements.usEntity));
  add(checkBoolean("small business status", company.smallBusiness, requirements.smallBusiness));
  listCheck("clearance", company.requiredClearances, requirements.clearances, "clearances");
  listCheck("certification", company.certifications, requirements.certifications, "certifications");
  listCheck("geography", company.operatingGeographies, requirements.allowedGeographies, "geography");
  for (const field of requirements.unverifiedCriticalFields ?? []) {
    checks.push({ field, state: "unknown", detail: `${field} is not verified from the source record` });
  }
  return checks;
}

/** Scores the locked 100-point rubric. A deadline is intentionally not a scoring input. */
export function scoreOpportunity(company: CompanyProfile, opportunity: Opportunity): ScoreBreakdown {
  const missionMatches = overlap(company.missionAreas, opportunity.missionAreas);
  const exactMatches = overlap(company.exactTerms, opportunity.exactTerms);
  const conceptMatches = overlap(company.controlledConcepts, opportunity.controlledConcepts);
  const technologyMatches = overlap(company.technologyAndRd, opportunity.technologyAndRd);
  const useMatches = overlap(company.customerUses, opportunity.customerUses);
  const geographyMatches = overlap(company.operatingGeographies, opportunity.geographies);
  const amount = company.targetAmount && opportunity.amount
    ? amountFitScore(company.targetAmount, opportunity.amount)
    : 0;
  const score = {
    mission: ratioScore(missionMatches.length, setOf(opportunity.missionAreas).size, setOf(company.missionAreas).size, 25),
    exactTerms: ratioScore(exactMatches.length, setOf(opportunity.exactTerms).size, setOf(company.exactTerms).size, 20),
    controlledConcepts: ratioScore(conceptMatches.length, setOf(opportunity.controlledConcepts).size, setOf(company.controlledConcepts).size, 15),
    technologyAndRd: ratioScore(technologyMatches.length, setOf(opportunity.technologyAndRd).size, setOf(company.technologyAndRd).size, 15),
    customerUse: ratioScore(useMatches.length, setOf(opportunity.customerUses).size, setOf(company.customerUses).size, 10),
    amount,
    geography: ratioScore(geographyMatches.length, setOf(opportunity.geographies).size, setOf(company.operatingGeographies).size, 5),
    total: 0,
  };
  score.total = score.mission + score.exactTerms + score.controlledConcepts + score.technologyAndRd + score.customerUse + score.amount + score.geography;
  return score;
}

function amountFitScore(
  company: NonNullable<CompanyProfile["targetAmount"]>,
  opportunity: NonNullable<Opportunity["amount"]>,
) {
  if (company.currency !== opportunity.currency) return 0;
  const companyMin = company.min ?? 0;
  const companyMax = company.max ?? Number.POSITIVE_INFINITY;
  const opportunityMin = opportunity.min ?? 0;
  const opportunityMax = opportunity.max ?? Number.POSITIVE_INFINITY;
  if (companyMin > opportunityMax || opportunityMin > companyMax) return 0;
  if (companyMin >= opportunityMin && companyMax <= opportunityMax) return 10;
  if (opportunityMin >= companyMin && opportunityMax <= companyMax) return 8;
  return 6;
}

type ConceptGroupName = "mission" | "exact terms" | "controlled concepts" | "technology/R&D" | "customer/use";
type ConceptShape = Pick<CompanyProfile, "missionAreas" | "exactTerms" | "controlledConcepts" | "technologyAndRd" | "customerUses">;

function conceptGroups(concepts: ConceptShape): Array<[ConceptGroupName, readonly string[]]> {
  return [
    ["mission", concepts.missionAreas],
    ["exact terms", concepts.exactTerms],
    ["controlled concepts", concepts.controlledConcepts],
    ["technology/R&D", concepts.technologyAndRd],
    ["customer/use", concepts.customerUses],
  ];
}

function hasSpecializedMissionConflict(company: CompanyProfile, concepts: ConceptShape) {
  const companyMissions = setOf(company.missionAreas);
  return concepts.missionAreas.some((mission) =>
    SPECIALIZED_MISSIONS.has(normalize(mission))
    && !companyMissions.has(normalize(mission)));
}

function hasDomainMatch(
  company: CompanyProfile,
  concepts: ConceptShape,
  excluded: ReadonlySet<string>,
) {
  const companySet = setOf(conceptGroups(company)
    .flatMap(([, values]) => values)
    .filter((concept) => !excluded.has(normalize(concept))));
  return conceptGroups(concepts).some(([, values]) => values.some((concept) => {
    const normalized = normalize(concept);
    return !excluded.has(normalized) && companySet.has(normalized);
  }));
}

function hasNonBroadExactTermMatch(company: CompanyProfile, concepts: ConceptShape) {
  const companyTerms = setOf(company.exactTerms.filter((term) =>
    !BROAD_EXACT_TERMS.has(normalize(term))));
  return concepts.exactTerms.some((term) => {
    const normalized = normalize(term);
    return !BROAD_EXACT_TERMS.has(normalized) && companyTerms.has(normalized);
  });
}

function matchedDomainEvidence(
  company: CompanyProfile,
  concepts: ConceptShape,
  excluded: ReadonlySet<string>,
) {
  const companyGroups = new Map(conceptGroups(company));
  const values = new Set<string>();
  const groups = new Set<ConceptGroupName>();
  for (const [name, sourceValues] of conceptGroups(concepts)) {
    const matched = overlap(companyGroups.get(name) ?? [], sourceValues)
      .map(normalize)
      .filter((value) => !excluded.has(value));
    if (matched.length) groups.add(name);
    for (const value of matched) values.add(value);
  }
  return { values, groups };
}

function hasIndependentTitleAndScopeEvidence(
  company: CompanyProfile,
  titleConcepts: ConceptShape,
  scopeConcepts: ConceptShape | undefined,
) {
  if (!scopeConcepts) return false;
  const excluded = new Set([...GENERIC_TITLE_CONCEPTS, ...BROAD_EXACT_TERMS]);
  const titleEvidence = matchedDomainEvidence(company, titleConcepts, excluded);
  const scopeEvidence = matchedDomainEvidence(company, scopeConcepts, excluded);
  if (!titleEvidence.values.size || !scopeEvidence.values.size) return false;
  const values = new Set([...titleEvidence.values, ...scopeEvidence.values]);
  const groups = new Set([...titleEvidence.groups, ...scopeEvidence.groups]);
  const sourceDifference = [...titleEvidence.values].some((value) => !scopeEvidence.values.has(value))
    || [...scopeEvidence.values].some((value) => !titleEvidence.values.has(value));
  return values.size >= 2 && groups.size >= 2 && sourceDifference;
}

function analyzeDomainEvidence(company: CompanyProfile, opportunity: Opportunity) {
  const titleConcepts = opportunity.titleConcepts ?? normalizeConcepts(opportunity.title);
  const scopeConcepts = opportunity.scopeSummary?.trim()
    ? normalizeConcepts(opportunity.scopeSummary)
    : undefined;
  const titleConflict = hasSpecializedMissionConflict(company, titleConcepts);
  const scopeConflict = scopeConcepts
    ? hasSpecializedMissionConflict(company, scopeConcepts)
    : false;
  const specializedConflict = titleConflict || scopeConflict;
  const titleDomainMatch = !titleConflict
    && hasDomainMatch(company, titleConcepts, GENERIC_TITLE_CONCEPTS);
  const scopeExcluded = new Set([...GENERIC_TITLE_CONCEPTS, ...BROAD_EXACT_TERMS]);
  const scopeExactTermMatch = scopeConcepts
    ? !scopeConflict && hasNonBroadExactTermMatch(company, scopeConcepts)
    : false;
  const scopeDomainMatch = scopeConcepts
    ? !scopeConflict && hasDomainMatch(company, scopeConcepts, scopeExcluded)
    : false;
  const titleExactTermMatch = !titleConflict
    && hasNonBroadExactTermMatch(company, titleConcepts);
  const independentTitleAndScopeEvidence = !specializedConflict
    && hasIndependentTitleAndScopeEvidence(company, titleConcepts, scopeConcepts);
  return {
    titleDomainMatch,
    scopeExactTermMatch,
    scopeDomainMatch,
    pursueAnchorMatch: !specializedConflict && (
      titleExactTermMatch
      || scopeExactTermMatch
      || independentTitleAndScopeEvidence
    ),
  };
}

export function matchOpportunity(company: CompanyProfile, opportunity: Opportunity): MatchResult {
  const eligibility = evaluateEligibility(company, opportunity);
  const score = scoreOpportunity(company, opportunity);
  const unknownCriticalFacts = eligibility.filter((check) => check.state === "unknown").map((check) => check.field);
  const hasHardFailure = eligibility.some((check) => check.state === "fail");
  const partnerRequired = eligibility.some((check) => check.state === "partner");
  const groups = matchedGroups(company, opportunity);
  const {
    titleDomainMatch,
    scopeExactTermMatch,
    scopeDomainMatch,
    pursueAnchorMatch,
  } = analyzeDomainEvidence(company, opportunity);
  const domainEvidenceMatch = titleDomainMatch || scopeExactTermMatch || scopeDomainMatch;
  const fitStatus: FitStatus = hasHardFailure
    || !domainEvidenceMatch
    || score.total < 20
    || groups.length < 1
    || (groups.length < 2 && !pursueAnchorMatch)
    ? "No Fit"
    : unknownCriticalFacts.length
      ? "Potential Fit"
      : score.total >= 70 && groups.length >= 2 && pursueAnchorMatch
        ? "Strong Fit"
        : "Potential Fit";
  const decision = decide({
    hasHardFailure,
    partnerRequired,
    unknownCriticalFacts,
    score: score.total,
    groups: groups.length,
    domainEvidenceMatch,
    pursueAnchorMatch,
  });
  const reason = hasHardFailure
    ? "A hard eligibility requirement is not met."
    : !domainEvidenceMatch
      ? "The notice title and synopsis do not contain a non-generic domain match."
    : score.total < 20
      ? "The domain is relevant, but the weighted evidence is too thin to retain."
      : groups.length < 1
        ? "No meaningful non-generic concept group matched."
        : groups.length < 2 && !pursueAnchorMatch
          ? "One broad concept group is not enough without a specific title or scope anchor."
          : partnerRequired
            ? "A required capability can be supplied only through an eligible partner."
          : unknownCriticalFacts.length
            ? `Critical facts need verification: ${unknownCriticalFacts.join(", ")}.`
            : groups.length < 2
              ? "One meaningful concept group matched, so this remains a cautious watch item."
              : !pursueAnchorMatch && score.total >= 70
                ? "Pursue now requires a non-broad exact term or independent title and scope evidence."
                : "Deterministic rubric and eligibility checks completed.";
  return { companyId: company.id, opportunityId: opportunity.id, fitStatus, decision, score, eligibility, matchedConceptGroups: groups, unknownCriticalFacts, titleDomainMatch, scopeExactTermMatch, scopeDomainMatch, reason };
}

function matchedGroups(company: CompanyProfile, opportunity: Opportunity): string[] {
  const groups: Array<[ConceptGroupName, readonly string[], readonly string[]]> = [
    ["mission", company.missionAreas, opportunity.missionAreas],
    ["exact terms", company.exactTerms, opportunity.exactTerms],
    ["controlled concepts", company.controlledConcepts, opportunity.controlledConcepts],
    ["technology/R&D", company.technologyAndRd, opportunity.technologyAndRd],
    ["customer/use", company.customerUses, opportunity.customerUses],
  ];
  return groups
    .filter(([, left, right]) => overlap(left, right)
      .some((value) => !GENERIC_TITLE_CONCEPTS.has(normalize(value))))
    .map(([name]) => name);
}

function decide(input: {
  hasHardFailure: boolean;
  partnerRequired: boolean;
  unknownCriticalFacts: readonly string[];
  score: number;
  groups: number;
  domainEvidenceMatch: boolean;
  pursueAnchorMatch: boolean;
}): DecisionLabel {
  if (input.hasHardFailure || !input.domainEvidenceMatch) return "Skip";
  if (input.score < 20 || input.groups < 1) return "Skip";
  if (input.groups < 2 && !input.pursueAnchorMatch) return "Skip";
  if (input.partnerRequired) return "Partner-dependent";
  if (input.unknownCriticalFacts.length) return "Verify first";
  if (input.score >= 70 && input.pursueAnchorMatch) return "Pursue now";
  return "Watch";
}

/** Sorts by score, then evidence quality, then deadline and stable opportunity ID. */
export function rankOpportunities(company: CompanyProfile, opportunities: readonly Opportunity[]): MatchResult[] {
  return opportunities
    .map((opportunity) => ({ result: matchOpportunity(company, opportunity), opportunity }))
    .sort((a, b) =>
      b.result.score.total - a.result.score.total
      || a.result.unknownCriticalFacts.length - b.result.unknownCriticalFacts.length
      || b.result.matchedConceptGroups.length - a.result.matchedConceptGroups.length
      || deadlineValue(a.opportunity.deadline) - deadlineValue(b.opportunity.deadline)
      || a.opportunity.id.localeCompare(b.opportunity.id))
    .map(({ result }) => result);
}

function deadlineValue(deadline: string | undefined): number {
  return deadline ? Date.parse(deadline) : Number.POSITIVE_INFINITY;
}
