import {
  discoverOpportunities,
  selectOpportunityCandidates,
  type OpportunityDiscovery,
  type OpportunityRanker,
} from "./opportunity-discovery";
import { rankOpportunities } from "./opportunity-matching";
import {
  reviewOpportunitySemantics,
  type LunaSemanticReviewDependencies,
  type SemanticReviewProcessing,
} from "./opportunity-semantic-review";
import { EXTERNAL_PROCESSING_DISCLOSURE } from "./intake/external-processing";
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
  semanticReview?: SemanticReviewProcessing;
  externalProcessingDisclosure?: string;
}

export interface GovernmentSourceSearchOptions {
  mode?: SourceMode;
  fetcher?: typeof fetch;
  grantsDetailFetcher?: typeof fetch;
  now?: () => Date;
  assistanceListingsStore?: AssistanceListingsStore;
  sbirAwardsStore?: SbirAwardsStore;
  ranker?: OpportunityRanker;
  semanticReview?: LunaSemanticReviewDependencies;
}

export type SearchQueryFamily =
  | "exact"
  | "controlled"
  | "customer"
  | "mission"
  | "technology";

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
  const queries: SearchQuery[] = [];
  const seen = new Set<string>();
  const addTerms = (
    family: SearchQueryFamily,
    terms: readonly string[],
    familyLimit: number,
  ) => {
    let added = 0;
    for (const candidate of terms) {
      if (queries.length >= 8 || added >= familyLimit) break;
      const term = candidate.trim();
      const normalized = term.toLocaleLowerCase("en-US");
      if (
        normalized.length < 3
        || GENERIC_SEARCH_TERMS.has(normalized)
        || seen.has(normalized)
      ) continue;
      seen.add(normalized);
      queries.push({ term, family });
      added += 1;
    }
  };

  addTerms("exact", company.exactTerms, 2);
  addTerms("controlled", company.controlledConcepts, 2);
  addTerms("customer", company.customerUses, 1);
  addTerms("mission", company.missionAreas, 1);
  if (
    queries.length > 0
    && queries.length < 8
    && company.smallBusiness === "yes"
    && company.technologyAndRd.length > 0
  ) {
    queries.push({
      term: "small business innovation research",
      family: "technology",
    });
    seen.add("small business innovation research");
  }
  addTerms("technology", company.technologyAndRd, 2);
  return queries.slice(0, 8);
}

function combinedSourceStatus<TRecord extends SourcedGovernmentRecord>(
  results: readonly SourceResult<TRecord>[],
): SourceResultStatus {
  if (results.some((result) => result.status === "cached-fallback")) {
    return "cached-fallback";
  }
  if (results.some((result) => result.status === "cached")) return "cached";
  if (results.some((result) => result.status === "live")) return "live";
  return "unavailable";
}

function combineSourceResults<TRecord extends SourcedGovernmentRecord>(
  results: readonly SourceResult<TRecord>[],
): SourceResult<TRecord> {
  const first = results[0];
  const recordById = new Map<string, TRecord>();
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

function selectEnrichmentCandidates(
  ranked: readonly CurrentOpportunityRecord[],
  queryResults: readonly SourceResult<CurrentOpportunityRecord>[],
  canonicalRecords: readonly CurrentOpportunityRecord[],
  limit: number,
) {
  const selected = new Map<string, CurrentOpportunityRecord>();
  const canonicalById = new Map(canonicalRecords.map((record) => [record.id, record]));
  const add = (record: CurrentOpportunityRecord | undefined) => {
    const canonical = record ? canonicalById.get(record.id) : undefined;
    if (!canonical || selected.size >= limit || selected.has(canonical.id)) return false;
    selected.set(canonical.id, canonical);
    return true;
  };
  ranked.slice(0, Math.ceil(limit / 2)).forEach(add);
  const diverseLimit = Math.floor(limit / 2);
  let diverseAdded = 0;
  const maximumResultLength = Math.max(0, ...queryResults.map((result) => result.records.length));
  for (
    let index = 0;
    index < maximumResultLength && diverseAdded < diverseLimit;
    index += 1
  ) {
    for (const result of queryResults) {
      if (diverseAdded >= diverseLimit) break;
      if (add(result.records[index])) diverseAdded += 1;
    }
  }
  ranked.forEach(add);
  return [...selected.values()];
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
  const grantQueries = searchQueries.length
    ? searchQueries
    : [{ term: "", family: "exact" as const }];
  const grantResults = await Promise.all(
    grantQueries.map((query) => searchGrants({ keyword: query.term }, adapterOptions)),
  );
  let grants = combineSourceResults(grantResults);
  const ranker = options.ranker ?? rankOpportunities;
  const detailFetcher = options.grantsDetailFetcher ?? options.fetcher ?? fetch;
  const detailModeEnabled = options.mode !== "cached" && options.mode !== "failure";
  if (detailModeEnabled && grants.records.length) {
    const candidates = selectEnrichmentCandidates(
      selectOpportunityCandidates(
        company,
        grants.records,
        ranker,
        24,
      ),
      grantResults.filter((_result, index) =>
        grantQueries[index]?.term !== "small business innovation research"),
      grants.records,
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

  const contextQueries = (searchQueries.length
    ? searchQueries
    : [{ term: keyword, family: "exact" as const }])
    .filter((query) => query.term !== "small business innovation research")
    .slice(0, 3);
  const assistanceInputs = assistanceListing
    ? [{ assistanceListing }]
    : contextQueries.map((query) => ({ keyword: query.term }));
  const sbirKeywords = contextQueries.map((query) => query.term);
  const [programResults, spending, sbirResults] = await Promise.all([
    Promise.all(assistanceInputs.map((input) =>
      searchAssistanceListings(input, {
        ...adapterOptions,
        store: options.assistanceListingsStore,
      }).catch(() => searchAssistanceListings(input, {
        ...adapterOptions,
        mode: "failure",
      })))),
    searchUsaSpending(assistanceListing, adapterOptions),
    Promise.all(sbirKeywords.map((term) =>
      searchSbirAwards(term, {
        ...adapterOptions,
        store: options.sbirAwardsStore,
      }).catch(() => searchSbirAwards(term, {
        ...adapterOptions,
        mode: "failure",
      })))),
  ]);
  const programs = combineSourceResults(programResults);
  const sbir = combineSourceResults(sbirResults);

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

  let discovery = discoverOpportunities(
    company,
    records,
    ranker,
  );
  let semanticReview: SemanticReviewProcessing | undefined;
  const warnings = sources.flatMap((source) => source.warning ? [source.warning] : []);
  if (options.semanticReview) {
    const reviewed = await reviewOpportunitySemantics({
      company,
      discovery,
    }, options.semanticReview);
    discovery = reviewed.discovery;
    semanticReview = reviewed.processing;
    if (
      !reviewed.processing.completed
      && reviewed.processing.reason !== "not_applicable"
    ) {
      warnings.push(
        `Luna semantic scope review was unavailable (${reviewed.processing.reason}); deterministic ranking was preserved.`,
      );
    }
  }

  return {
    query: {
      keyword,
      assistanceListing: assistanceListing || null,
    },
    sources,
    discovery,
    warnings,
    ...(semanticReview ? {
      semanticReview,
      externalProcessingDisclosure: EXTERNAL_PROCESSING_DISCLOSURE,
    } : {}),
  };
}
