import type {
  EligibilityCheck,
  MatchResult,
  Opportunity,
  Provenance,
} from "./opportunity-types";

export interface OpportunityExplanation {
  matchedGroups: readonly string[];
  eligibility: readonly EligibilityCheck[];
  reason: string;
  source: Provenance;
}

export function createOpportunityExplanation(
  opportunity: Opportunity,
  match: MatchResult,
): OpportunityExplanation {
  return {
    matchedGroups: [...match.matchedConceptGroups],
    eligibility: [...match.eligibility],
    reason: match.reason,
    source: opportunity.source,
  };
}
