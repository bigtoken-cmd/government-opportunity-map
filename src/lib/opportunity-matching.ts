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
const ratioScore = (matched: number, requested: number, weight: number) =>
  requested === 0 ? 0 : Math.round((matched / requested) * weight);

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
  listCheck("legal entity type", company.legalEntityTypes, requirements.legalEntityTypes, "legalEntityType");
  add(checkBoolean("SAM registration", company.samRegistration, requirements.samRegistration));
  add(checkBoolean("UEI", company.uei, requirements.uei));
  add(checkBoolean("US entity", company.usEntity, requirements.usEntity));
  add(checkBoolean("small business status", company.smallBusiness, requirements.smallBusiness));
  listCheck("clearance", company.requiredClearances, requirements.clearances, "clearances");
  listCheck("certification", company.certifications, requirements.certifications, "certifications");
  listCheck("geography", company.operatingGeographies, requirements.allowedGeographies, "geography");
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
    ? amountOverlap(company.targetAmount, opportunity.amount) ? 10 : 0
    : 0;
  const score = {
    mission: ratioScore(missionMatches.length, opportunity.missionAreas.length, 25),
    exactTerms: ratioScore(exactMatches.length, opportunity.exactTerms.length, 20),
    controlledConcepts: ratioScore(conceptMatches.length, opportunity.controlledConcepts.length, 15),
    technologyAndRd: ratioScore(technologyMatches.length, opportunity.technologyAndRd.length, 15),
    customerUse: ratioScore(useMatches.length, opportunity.customerUses.length, 10),
    amount,
    geography: ratioScore(geographyMatches.length, opportunity.geographies.length, 5),
    total: 0,
  };
  score.total = score.mission + score.exactTerms + score.controlledConcepts + score.technologyAndRd + score.customerUse + score.amount + score.geography;
  return score;
}

function amountOverlap(
  company: NonNullable<CompanyProfile["targetAmount"]>,
  opportunity: NonNullable<Opportunity["amount"]>,
): boolean {
  if (company.currency !== opportunity.currency) return false;
  const companyMin = company.min ?? 0;
  const companyMax = company.max ?? Number.POSITIVE_INFINITY;
  const opportunityMin = opportunity.min ?? 0;
  const opportunityMax = opportunity.max ?? Number.POSITIVE_INFINITY;
  return companyMin <= opportunityMax && opportunityMin <= companyMax;
}

export function matchOpportunity(company: CompanyProfile, opportunity: Opportunity): MatchResult {
  const eligibility = evaluateEligibility(company, opportunity);
  const score = scoreOpportunity(company, opportunity);
  const unknownCriticalFacts = eligibility.filter((check) => check.state === "unknown").map((check) => check.field);
  const hasHardFailure = eligibility.some((check) => check.state === "fail");
  const partnerRequired = eligibility.some((check) => check.state === "partner");
  const groups = matchedGroups(company, opportunity);
  const fitStatus: FitStatus = hasHardFailure ? "No Fit" : unknownCriticalFacts.length ? "Potential Fit" : score.total >= 70 && groups.length >= 2 ? "Strong Fit" : "Potential Fit";
  const decision = decide({ hasHardFailure, partnerRequired, unknownCriticalFacts, score: score.total, groups: groups.length });
  const reason = hasHardFailure
    ? "A hard eligibility requirement is not met."
    : partnerRequired
      ? "A required capability can be supplied only through an eligible partner."
      : unknownCriticalFacts.length
        ? `Critical facts need verification: ${unknownCriticalFacts.join(", ")}.`
        : groups.length < 2
          ? "Fewer than two meaningful concept groups matched."
          : "Deterministic rubric and eligibility checks completed.";
  return { companyId: company.id, opportunityId: opportunity.id, fitStatus, decision, score, eligibility, matchedConceptGroups: groups, unknownCriticalFacts, reason };
}

function matchedGroups(company: CompanyProfile, opportunity: Opportunity): string[] {
  const groups: Array<[string, readonly string[], readonly string[]]> = [
    ["mission", company.missionAreas, opportunity.missionAreas],
    ["exact terms", company.exactTerms, opportunity.exactTerms],
    ["controlled concepts", company.controlledConcepts, opportunity.controlledConcepts],
    ["technology/R&D", company.technologyAndRd, opportunity.technologyAndRd],
    ["customer/use", company.customerUses, opportunity.customerUses],
  ];
  return groups.filter(([, left, right]) => overlap(left, right).length > 0).map(([name]) => name);
}

function decide(input: { hasHardFailure: boolean; partnerRequired: boolean; unknownCriticalFacts: readonly string[]; score: number; groups: number }): DecisionLabel {
  if (input.hasHardFailure) return "Skip";
  if (input.partnerRequired) return "Partner-dependent";
  if (input.unknownCriticalFacts.length) return "Verify first";
  if (input.score >= 70 && input.groups >= 2) return "Pursue now";
  if (input.score >= 35) return "Watch";
  return "Skip";
}

/** Sorts by fit score, then deadline only as the tie-breaker, then stable opportunity ID. */
export function rankOpportunities(company: CompanyProfile, opportunities: readonly Opportunity[]): MatchResult[] {
  return opportunities
    .map((opportunity) => ({ result: matchOpportunity(company, opportunity), opportunity }))
    .sort((a, b) => b.result.score.total - a.result.score.total || deadlineValue(a.opportunity.deadline) - deadlineValue(b.opportunity.deadline) || a.opportunity.id.localeCompare(b.opportunity.id))
    .map(({ result }) => result);
}

function deadlineValue(deadline: string | undefined): number {
  return deadline ? Date.parse(deadline) : Number.POSITIVE_INFINITY;
}
