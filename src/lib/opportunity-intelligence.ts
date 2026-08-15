import type {
  CompanyProfile,
  EvidenceMapping,
  MatchResult,
  Opportunity,
  RecommendationAction,
  RecommendationConcern,
  RouteType,
} from "./opportunity-types";
import type { HistoricalAwardRecord } from "./sources/source-contracts";

export interface RecommendationHistoricalSupport {
  awards: readonly HistoricalAwardRecord[];
  typicalAwardAmount?: number;
  utahRecipients?: readonly string[];
  limitation?: string;
}

export interface RecommendationIntelligence {
  routeType: RouteType;
  decisionSummary: string;
  whyFit: readonly EvidenceMapping[];
  concerns: readonly RecommendationConcern[];
  nextAction: RecommendationAction;
  historicalSupport?: RecommendationHistoricalSupport;
}

const normalize = (value: string) => value.trim().toLocaleLowerCase("en-US");

function evidenceId(prefix: string, value: string) {
  const suffix = normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${prefix}-${suffix || "fact"}`;
}

function sharedFacts(
  company: CompanyProfile,
  opportunity: Opportunity,
): EvidenceMapping[] {
  const groups: ReadonlyArray<{
    companyFacts: readonly string[];
    opportunityFacts: readonly string[];
    label: string;
  }> = [
    {
      companyFacts: company.exactTerms,
      opportunityFacts: opportunity.exactTerms,
      label: "exact-term",
    },
    {
      companyFacts: company.controlledConcepts,
      opportunityFacts: opportunity.controlledConcepts,
      label: "concept",
    },
    {
      companyFacts: company.missionAreas,
      opportunityFacts: opportunity.missionAreas,
      label: "mission",
    },
    {
      companyFacts: company.technologyAndRd,
      opportunityFacts: opportunity.technologyAndRd,
      label: "technology",
    },
    {
      companyFacts: company.customerUses,
      opportunityFacts: opportunity.customerUses,
      label: "customer-use",
    },
  ];
  const mappings: EvidenceMapping[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    const opportunityByNormalized = new Map(
      group.opportunityFacts.map((fact) => [normalize(fact), fact]),
    );
    for (const companyFact of group.companyFacts) {
      const opportunityFact = opportunityByNormalized.get(normalize(companyFact));
      if (!opportunityFact || seen.has(`${group.label}:${normalize(companyFact)}`)) continue;
      seen.add(`${group.label}:${normalize(companyFact)}`);
      const exactTerm = group.label === "exact-term";
      mappings.push({
        companyFact: exactTerm
          ? `The confirmed company profile uses the exact term “${companyFact}”.`
          : `The confirmed company profile maps to the ${group.label} category “${companyFact}”.`,
        companyEvidenceId: evidenceId("company", `${group.label}-${companyFact}`),
        opportunityFact: exactTerm
          ? `The official title or synopsis for “${opportunity.title}” uses the exact term “${opportunityFact}”.`
          : `The official title or synopsis for “${opportunity.title}” maps to the ${group.label} category “${opportunityFact}”.`,
        opportunityEvidenceId: evidenceId(
          `notice-${opportunity.source.sourceId}`,
          `${group.label}-${opportunityFact}`,
        ),
        sourceUrl: opportunity.source.sourceUrl,
      });
      if (mappings.length === 3) return mappings;
      break;
    }
  }
  return mappings;
}

function routeType(match: MatchResult): RouteType {
  if (match.decision === "Pursue now") return "direct";
  if (match.decision === "Partner-dependent") return "partner";
  if (match.decision === "Verify first") return "verify";
  return "watch";
}

function partnerCategory(opportunity: Opportunity) {
  const categories = opportunity.eligibility.applicantTypes ?? [];
  if (!categories.length) return "eligible applicant";
  return categories.slice(0, 2).join(" or ");
}

function decisionSummary(
  opportunity: Opportunity,
  match: MatchResult,
  route: RouteType,
) {
  if (route === "direct") {
    return `The confirmed profile matches a supported direct applicant route and the scope of “${opportunity.title}.”`;
  }
  if (route === "partner") {
    return `The company is not a direct applicant for “${opportunity.title}”; pursue it only with an eligible ${partnerCategory(opportunity)} partner.`;
  }
  if (route === "verify") {
    const fact = match.unknownCriticalFacts[0] ?? "one critical eligibility fact";
    return `“${opportunity.title}” is relevant, but ${fact} must be verified before deciding whether to pursue it.`;
  }
  return opportunity.opportunityStatus === "forecast"
    ? `“${opportunity.title}” is a relevant forecast to monitor, but it is not yet an actionable direct application.`
    : `“${opportunity.title}” is relevant, but the current evidence does not support immediate pursuit.`;
}

function concerns(
  opportunity: Opportunity,
  match: MatchResult,
): RecommendationConcern[] {
  const result: RecommendationConcern[] = match.eligibility.flatMap(
    (check): RecommendationConcern[] => {
      if (check.state === "fail") {
        return [{
          severity: "blocking",
          text: check.detail,
          evidenceId: evidenceId(`notice-${opportunity.source.sourceId}`, check.field),
          sourceUrl: opportunity.source.sourceUrl,
        }];
      }
      if (check.state === "partner") {
        return [{
          severity: "blocking",
          text: `${check.detail}; the official applicant categories are ${partnerCategory(opportunity)}.`,
          evidenceId: evidenceId(`notice-${opportunity.source.sourceId}`, check.field),
          sourceUrl: opportunity.source.sourceUrl,
        }];
      }
      if (check.state === "unknown") {
        return [{
          severity: "verify",
          text: check.detail,
          evidenceId: evidenceId(`notice-${opportunity.source.sourceId}`, check.field),
          sourceUrl: opportunity.source.sourceUrl,
        }];
      }
      return [];
    },
  );
  if (opportunity.costShare) {
    result.push({
      severity: "caution",
      text: "The official notice indicates that cost sharing is required.",
      evidenceId: evidenceId(`notice-${opportunity.source.sourceId}`, "cost-share"),
      sourceUrl: opportunity.source.sourceUrl,
    });
  }
  if (!result.length) {
    result.push({
      severity: "caution",
      text: "Confirm the current official application package before submitting.",
      sourceUrl: opportunity.source.sourceUrl,
    });
  }
  return result.slice(0, 3);
}

function nextAction(
  opportunity: Opportunity,
  match: MatchResult,
  route: RouteType,
): RecommendationAction {
  const deadline = opportunity.deadline ? ` before ${opportunity.deadline}` : "";
  if (route === "direct") {
    return {
      type: "apply",
      text: `Open the official notice and begin the application package${deadline}.`,
    };
  }
  if (route === "partner") {
    return {
      type: "find-partner",
      text: `Prepare a one-page project concept and approach an eligible ${partnerCategory(opportunity)} partner${deadline}.`,
    };
  }
  if (route === "verify") {
    const fact = match.unknownCriticalFacts[0] ?? "the unresolved eligibility requirement";
    return {
      type: "verify",
      text: `Open the official notice and verify ${fact}${deadline}.`,
    };
  }
  return {
    type: "monitor",
    text: opportunity.opportunityStatus === "forecast"
      ? "Monitor the official notice for a posted application package."
      : `Review the official notice and monitor it for a stronger fit${deadline}.`,
  };
}

function historicalSupport(
  opportunity: Opportunity,
  awards: readonly HistoricalAwardRecord[],
): RecommendationHistoricalSupport {
  const assistanceListings = new Set(opportunity.assistanceListings ?? []);
  const matchingAwards = awards
    .filter((award) => assistanceListings.has(award.assistanceListing))
    .slice(0, 3);
  const amounts = matchingAwards
    .map((award) => award.amount)
    .filter((amount): amount is number => typeof amount === "number" && Number.isFinite(amount));
  return {
    awards: matchingAwards,
    ...(amounts.length
      ? { typicalAwardAmount: Math.round(amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length) }
      : {}),
    limitation: matchingAwards.length
      ? "Historical awards show past activity only and do not prove current eligibility."
      : "No matching historical award was returned by this bounded search.",
  };
}

export function createRecommendationIntelligence(
  company: CompanyProfile,
  opportunity: Opportunity,
  match: MatchResult,
  historicalAwards: readonly HistoricalAwardRecord[],
): RecommendationIntelligence {
  const route = routeType(match);
  return {
    routeType: route,
    decisionSummary: decisionSummary(opportunity, match, route),
    whyFit: sharedFacts(company, opportunity),
    concerns: concerns(opportunity, match),
    nextAction: nextAction(opportunity, match, route),
    historicalSupport: historicalSupport(opportunity, historicalAwards),
  };
}
