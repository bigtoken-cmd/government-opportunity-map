import { normalizeConcepts } from "./concept-normalization";
import type {
  CompanyProfile,
  MatchResult,
  Opportunity,
} from "./opportunity-types";
import type {
  CurrentOpportunityRecord,
  HistoricalAwardRecord,
  ProgramContextRecord,
  SourcedGovernmentRecord,
} from "./sources/source-contracts";

export interface DiscoveryRecommendation {
  opportunity: Opportunity;
  match: MatchResult;
}

export interface OpportunityDiscovery {
  recommendations: readonly DiscoveryRecommendation[];
  programs: readonly ProgramContextRecord[];
  historicalAwards: readonly HistoricalAwardRecord[];
}

export type OpportunityRanker = (
  company: CompanyProfile,
  opportunities: readonly Opportunity[],
) => MatchResult[];

function opportunityStatus(status: string): Opportunity["opportunityStatus"] | null {
  const normalized = status.trim().toLocaleLowerCase("en-US");
  if (normalized.includes("forecast")) return "forecast";
  if (normalized === "posted" || normalized === "open") return "open";
  return null;
}

function toOpportunity(record: CurrentOpportunityRecord): Opportunity | null {
  const status = opportunityStatus(record.status);
  if (!status) return null;
  const concepts = normalizeConcepts(`${record.title} ${record.description}`);
  return {
    id: record.id,
    title: record.title,
    opportunityNumber: record.opportunityNumber,
    recordKind: "opportunity",
    source: record.source,
    agency: record.agency,
    opportunityStatus: status,
    deadline: record.deadline || undefined,
    ...concepts,
    geographies: [],
    eligibility: {
      unverifiedCriticalFields: [
        "exact notice applicant type",
        "SAM.gov registration",
        "Unique Entity ID",
      ],
    },
  };
}

function deduplicate<TRecord extends SourcedGovernmentRecord>(
  records: readonly TRecord[],
): TRecord[] {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

export function discoverOpportunities(
  company: CompanyProfile,
  records: readonly SourcedGovernmentRecord[],
  ranker: OpportunityRanker,
): OpportunityDiscovery {
  const currentRecords = deduplicate(
    records.filter((record): record is CurrentOpportunityRecord => record.kind === "current_opportunity"),
  );
  const opportunities = currentRecords
    .map(toOpportunity)
    .filter((record): record is Opportunity => Boolean(record));
  const opportunityById = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const recommendations = ranker(company, opportunities)
    .filter((match) => match.decision !== "Skip" && match.score.total >= 35)
    .flatMap((match): DiscoveryRecommendation[] => {
      const opportunity = opportunityById.get(match.opportunityId);
      return opportunity ? [{ opportunity, match }] : [];
    })
    .slice(0, 5);

  return {
    recommendations,
    programs: deduplicate(
      records.filter((record): record is ProgramContextRecord => record.kind === "program_context"),
    ),
    historicalAwards: deduplicate(
      records.filter((record): record is HistoricalAwardRecord => record.kind === "historical_award"),
    ),
  };
}
