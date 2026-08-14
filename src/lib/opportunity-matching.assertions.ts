import { demoCompanyProfiles } from "@/data/demo-company-profiles";
import { demoOpportunities } from "@/data/demo-opportunities";
import { matchOpportunity, rankOpportunities, scoreOpportunity } from "./opportunity-matching";
import type { CompanyProfile, Opportunity } from "./opportunity-types";

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(`Opportunity matching assertion failed: ${message}`);
};

/**
 * Dependency-free assertions. Invoke this function from any TypeScript-capable
 * test harness; compilation itself needs no test framework or Node type package.
 */
export function runOpportunityMatchingAssertions(): void {
  const water = demoCompanyProfiles[0];
  const waterOpportunity = demoOpportunities[0];
  const exact = matchOpportunity(water, waterOpportunity);
  assert(exact.score.total === 100, "an exact rubric match should score 100");
  assert(exact.decision === "Pursue now", "two or more meaningful groups should permit Pursue now");
  assert(exact.matchedConceptGroups.length >= 2, "top result should expose two meaningful concept groups");

  const civic = matchOpportunity(demoCompanyProfiles[1], demoOpportunities[1]);
  assert(civic.fitStatus === "Potential Fit", "unknown critical facts must cap the result at Potential Fit");
  assert(civic.decision === "Verify first", "unknown SAM and UEI must require verification");

  const healthWithVerifiedSmallBusiness: CompanyProfile = { ...demoCompanyProfiles[3], smallBusiness: "yes" };
  const partner = matchOpportunity(healthWithVerifiedSmallBusiness, demoOpportunities[5]);
  assert(partner.decision === "Partner-dependent", "partner-remediable clearance should produce Partner-dependent");

  const ineligible = matchOpportunity(demoCompanyProfiles[0], demoOpportunities[4]);
  assert(ineligible.decision === "Skip", "incompatible applicant type is a strict disqualifier");

  const sameScoreLater: Opportunity = { ...waterOpportunity, id: "DEMO-TIE-LATER", deadline: "2026-10-16T23:59:59Z" };
  const sameScoreEarlier: Opportunity = { ...waterOpportunity, id: "DEMO-TIE-EARLIER", deadline: "2026-10-14T23:59:59Z" };
  const ranked = rankOpportunities(water, [sameScoreLater, sameScoreEarlier]);
  assert(ranked[0].opportunityId === "DEMO-TIE-EARLIER", "deadline may resolve equal-score ties only");
  assert(scoreOpportunity(water, waterOpportunity).total === scoreOpportunity(water, { ...waterOpportunity, deadline: "2029-01-01T00:00:00Z" }).total, "deadline must not affect scoring");
}
