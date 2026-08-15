import {
  discoverOpportunities,
  selectOpportunityCandidates,
  type OpportunityDiscovery,
  type OpportunityRanker,
} from "./opportunity-discovery";
import { rankOpportunities } from "./opportunity-matching";
import type { CompanyProfile } from "./opportunity-types";
import { searchAssistanceListings } from "./sources/assistance-listings";
import type { AssistanceListingsStore } from "./sources/assistance-listings-store";
import { enrichGrantRecords, searchGrants } from "./sources/grants";
import { searchSbirAwards } from "./sources/sbir";
import type { SbirAwardsStore } from "./sources/sbir-store";
import type {
  CurrentOpportunityRecord,
  SourceMode,
  SourceResult,
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
  grantsDetailFetcher?: typeof fetch;
  now?: () => Date;
  assistanceListingsStore?: AssistanceListingsStore;
  sbirAwardsStore?: SbirAwardsStore;
  ranker?: OpportunityRanker;
}

export type SearchQueryFamily = "exact" | "controlled" | "technology";

export interface SearchQuery {
  term: string;
  family: SearchQueryFamily;
}

const GENERIC_SEARCH_TERMS = new Set([
  "artificial intelligence",
  "commercialization",
  "research and development",
  "software r&d",
  "technical innovation",
]);

export function buildSearchQueries(company: CompanyProfile): SearchQuery[] {
  const primaryGroups: ReadonlyArray<{
    family: SearchQueryFamily;
    terms: readonly string[];
  }> = [
    { family: "exact", terms: company.exactTerms },
    { family: "controlled", terms: company.controlledConcepts },
  ];
  const seen = new Set<string>();
  const selectQueries = (
    groups: ReadonlyArray<{
      family: SearchQueryFamily;
      terms: readonly string[];
    }>,
  ) => groups.flatMap(({ family, terms }): SearchQuery[] => {
    const term = terms.find((candidate) => {
      const normalized = candidate.trim().toLocaleLowerCase("en-US");
      return normalized.length >= 3
        && !GENERIC_SEARCH_TERMS.has(normalized)
        && !seen.has(normalized);
    });
    if (!term) return [];
    const normalized = term.trim().toLocaleLowerCase("en-US");
    seen.add(normalized);
    return [{ term: term.trim(), family }];
  });
  const primaryQueries = selectQueries(primaryGroups);
  return primaryQueries.length
    ? primaryQueries
    : selectQueries([{
      family: "technology",
      terms: company.technologyAndRd,
    }]);
}

function combinedSourceStatus(
  results: readonly SourceResult<CurrentOpportunityRecord>[],
): SourceResultStatus {
  if (results.some((result) => result.status === "cached-fallback")) {
    return "cached-fallback";
  }
  if (results.some((result) => result.status === "cached")) return "cached";
  if (results.some((result) => result.status === "live")) return "live";
  return "unavailable";
}

function combineGrantsResults(
  results: readonly SourceResult<CurrentOpportunityRecord>[],
): SourceResult<CurrentOpportunityRecord> {
  const first = results[0];
  const recordById = new Map<string, CurrentOpportunityRecord>();
  for (const result of results) {
    for (const record of result.records) {
      const existing = recordById.get(record.id);
      if (
        !existing
        || record.source.snapshotStatus === "live"
        || existing.source.snapshotStatus !== "live"
      ) {
        recordById.set(record.id, record);
      }
    }
  }
  const warnings = [...new Set(
    results.flatMap((result) => result.warning ? [result.warning] : []),
  )];
  return {
    source: first.source,
    sourceUrl: first.sourceUrl,
    status: combinedSourceStatus(results),
    retrievedAt: results
      .map((result) => result.retrievedAt)
      .sort()
      .at(-1) ?? first.retrievedAt,
    records: [...recordById.values()],
    warning: warnings.length ? warnings.join(" ") : null,
  };
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
  const searchQueries = buildSearchQueries(company);
  const keyword = searchQueries[0]?.term ?? "";
  const adapterOptions = {
    mode: options.mode,
    fetcher: options.fetcher,
    now: options.now,
  };
  let grants = combineGrantsResults(await Promise.all(
    (searchQueries.length ? searchQueries : [{ term: "", family: "exact" as const }])
      .map((query) => searchGrants({ keyword: query.term }, adapterOptions)),
  ));
  const ranker = options.ranker ?? rankOpportunities;
  const detailFetcher = options.grantsDetailFetcher ?? options.fetcher ?? fetch;
  const detailModeEnabled = options.mode !== "cached" && options.mode !== "failure";
  if (detailModeEnabled && grants.records.length) {
    const candidates = selectOpportunityCandidates(
      company,
      grants.records,
      ranker,
      24,
    );
    const candidateIds = new Set(candidates.map((record) => record.id));
    const orderedRecords = [
      ...candidates,
      ...grants.records.filter((record) => !candidateIds.has(record.id)),
    ];
    const enrichment = await enrichGrantRecords(orderedRecords, {
      fetcher: detailFetcher,
      now: options.now,
      maxRecords: candidates.length,
      concurrency: 12,
    });
    const warnings = [grants.warning, enrichment.warning].filter(Boolean);
    grants = {
      ...grants,
      records: enrichment.records,
      warning: warnings.length ? warnings.join(" ") : null,
    };
  }
  const assistanceListing = selectAssistanceListing(
    company,
    grants.records,
    ranker,
  );

  const assistanceInput = assistanceListing ? { assistanceListing } : { keyword };
  const [programs, spending, sbir] = await Promise.all([
    searchAssistanceListings(assistanceInput, {
      ...adapterOptions,
      store: options.assistanceListingsStore,
    }).catch(() => searchAssistanceListings(assistanceInput, {
      ...adapterOptions,
      mode: "failure",
    })),
    searchUsaSpending(assistanceListing, adapterOptions),
    searchSbirAwards(keyword, {
      ...adapterOptions,
      store: options.sbirAwardsStore,
    }).catch(() => searchSbirAwards(keyword, {
      ...adapterOptions,
      mode: "failure",
    })),
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
