import {
  discoverOpportunities,
  type OpportunityDiscovery,
  type OpportunityRanker,
} from "./opportunity-discovery";
import { rankOpportunities } from "./opportunity-matching";
import type { CompanyProfile } from "./opportunity-types";
import { searchAssistanceListings } from "./sources/assistance-listings";
import { searchGrants } from "./sources/grants";
import { searchSbirAwards } from "./sources/sbir";
import type {
  CurrentOpportunityRecord,
  SourceMode,
  SourceResultStatus,
  SourcedGovernmentRecord,
} from "./sources/source-contracts";
import { searchUsaSpending } from "./sources/usaspending";

export type SourceFamily = "grants" | "assistance-listings" | "usaspending" | "sbir";

export interface SourceSearchSummary {
  family: SourceFamily;
  name: string;
  status: SourceResultStatus;
  recordCount: number;
  warning: string | null;
  sourceUrl: string;
  retrievedAt: string;
}

export interface GovernmentSourceSearchResult {
  query: {
    keyword: string;
    assistanceListing: string | null;
  };
  sources: readonly SourceSearchSummary[];
  discovery: OpportunityDiscovery;
  warnings: readonly string[];
}

export interface GovernmentSourceSearchOptions {
  mode?: SourceMode;
  fetcher?: typeof fetch;
  now?: () => Date;
  gsaApiKey?: string;
  ranker?: OpportunityRanker;
}

function searchKeyword(company: CompanyProfile) {
  const isGeneric = (term: string) => term === "artificial intelligence";
  return [
    ...company.exactTerms,
    ...company.controlledConcepts,
    ...company.technologyAndRd,
  ].find((term) => term.trim().length >= 3 && !isGeneric(term)) ?? "";
}

export function selectAssistanceListing(
  company: CompanyProfile,
  records: readonly CurrentOpportunityRecord[],
  ranker: OpportunityRanker,
) {
  const topOpportunityId =
    discoverOpportunities(company, records, ranker).recommendations[0]?.opportunity.id;
  if (!topOpportunityId) return "";
  return records.find((record) => record.id === topOpportunityId)
    ?.assistanceListings[0] ?? "";
}

export async function searchGovernmentSources(
  company: CompanyProfile,
  options: GovernmentSourceSearchOptions = {},
): Promise<GovernmentSourceSearchResult> {
  const keyword = searchKeyword(company);
  const adapterOptions = {
    mode: options.mode,
    fetcher: options.fetcher,
    now: options.now,
  };
  const grants = await searchGrants({ keyword }, adapterOptions);
  const ranker = options.ranker ?? rankOpportunities;
  const assistanceListing = selectAssistanceListing(
    company,
    grants.records,
    ranker,
  );

  const [programs, spending, sbir] = await Promise.all([
    searchAssistanceListings(
      assistanceListing ? { assistanceListing } : { keyword },
      { ...adapterOptions, apiKey: options.gsaApiKey },
    ),
    searchUsaSpending(assistanceListing, adapterOptions),
    searchSbirAwards(keyword, adapterOptions),
  ]);

  const records: SourcedGovernmentRecord[] = [
    ...grants.records,
    ...programs.records,
    ...spending.records,
    ...sbir.records,
  ];
  const sources: SourceSearchSummary[] = [
    {
      family: "grants",
      name: grants.source,
      status: grants.status,
      recordCount: grants.records.length,
      warning: grants.warning,
      sourceUrl: grants.sourceUrl,
      retrievedAt: grants.retrievedAt,
    },
    {
      family: "assistance-listings",
      name: programs.source,
      status: programs.status,
      recordCount: programs.records.length,
      warning: programs.warning,
      sourceUrl: programs.sourceUrl,
      retrievedAt: programs.retrievedAt,
    },
    {
      family: "usaspending",
      name: spending.source,
      status: spending.status,
      recordCount: spending.records.length,
      warning: spending.warning,
      sourceUrl: spending.sourceUrl,
      retrievedAt: spending.retrievedAt,
    },
    {
      family: "sbir",
      name: sbir.source,
      status: sbir.status,
      recordCount: sbir.records.length,
      warning: sbir.warning,
      sourceUrl: sbir.sourceUrl,
      retrievedAt: sbir.retrievedAt,
    },
  ];

  return {
    query: {
      keyword,
      assistanceListing: assistanceListing || null,
    },
    sources,
    discovery: discoverOpportunities(
      company,
      records,
      ranker,
    ),
    warnings: sources.flatMap((source) => source.warning ? [source.warning] : []),
  };
}
