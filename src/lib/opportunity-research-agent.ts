import {
  RESEARCH_HISTORICAL_INSTRUCTIONS,
  RESEARCH_LISTING_INSTRUCTIONS,
  RESEARCH_PREFILL_INSTRUCTIONS,
  RESEARCH_QUERY_INSTRUCTIONS,
} from "./agents/instructions";
import {
  fetchListingPage,
  parseListingHowToApply,
  parseSimilarOpportunityIds,
} from "./listing-page";
import { listingPrefillFields } from "./listing-prefill";
import type {
  DiscoveryRecommendation,
  OpportunityDiscovery,
  OpportunityRanker,
} from "./opportunity-discovery";
import { discoverOpportunities } from "./opportunity-discovery";
import { rankOpportunities } from "./opportunity-matching";
import type { CompanyProfile } from "./opportunity-types";
import { enrichGrantRecords } from "./sources/grants";
import type { CurrentOpportunityRecord } from "./sources/source-contracts";

const DEFAULT_RESEARCH_TIMEOUT_MS = 12_000;
const MAX_SIMILAR_IDS = 5;
const LISTING_CONCURRENCY = 3;

export interface ResearchPassMeta {
  attempted: boolean;
  completed: boolean;
  durationMs: number;
  toolCalls: number;
  similarOpportunityCount: number;
  costEstimateUsd: number | null;
  reason: string | null;
}

export interface OpportunityResearchDependencies {
  fetcher?: typeof fetch;
  grantsDetailFetcher?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
  ranker?: OpportunityRanker;
}

function recordByRecommendation(
  recommendation: DiscoveryRecommendation,
  records: readonly CurrentOpportunityRecord[],
) {
  return records.find((record) => record.id === recommendation.opportunity.id);
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += concurrency) {
    results.push(...await Promise.all(items.slice(index, index + concurrency).map(mapper)));
  }
  return results;
}

export function researchAgentInstructions() {
  return {
    query: RESEARCH_QUERY_INSTRUCTIONS,
    listing: RESEARCH_LISTING_INSTRUCTIONS,
    historical: RESEARCH_HISTORICAL_INSTRUCTIONS,
    prefill: RESEARCH_PREFILL_INSTRUCTIONS,
  };
}

export async function researchReturnedOpportunities(
  company: CompanyProfile,
  discovery: OpportunityDiscovery,
  grantRecords: readonly CurrentOpportunityRecord[],
  dependencies: OpportunityResearchDependencies = {},
): Promise<{
  discovery: OpportunityDiscovery;
  researchPass: ResearchPassMeta;
  records: readonly CurrentOpportunityRecord[];
}> {
  const started = Date.now();
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_RESEARCH_TIMEOUT_MS;
  const fetcher = dependencies.fetcher ?? fetch;
  const ranker = dependencies.ranker ?? rankOpportunities;
  let nextDiscovery = discovery;
  let toolCalls = 0;
  let similarOpportunityCount = 0;
  let records = [...grantRecords];

  const attachPrefill = (
    current: OpportunityDiscovery,
    howToApplyById: Map<string, string>,
    similarById: Map<string, DiscoveryRecommendation["similarOpportunities"]>,
  ): OpportunityDiscovery => ({
    ...current,
    recommendations: current.recommendations.map((recommendation) => {
      const record = recordByRecommendation(recommendation, records);
      return {
        ...recommendation,
        listingPrefillFields: record
          ? listingPrefillFields(
            record,
            company,
            howToApplyById.get(recommendation.opportunity.id) ?? "",
          )
          : recommendation.listingPrefillFields,
        similarOpportunities: similarById.get(recommendation.opportunity.id)
          ?? recommendation.similarOpportunities
          ?? [],
      };
    }),
  });

  try {
    const listingResults = await mapPool(
      nextDiscovery.recommendations,
      LISTING_CONCURRENCY,
      async (recommendation) => {
        if (Date.now() - started > timeoutMs) {
          return {
            id: recommendation.opportunity.id,
            html: "",
            similarIds: [] as string[],
            howToApply: "",
          };
        }
        toolCalls += 1;
        const page = await fetchListingPage(recommendation.opportunity.id, { fetcher });
        if (!page) {
          return {
            id: recommendation.opportunity.id,
            html: "",
            similarIds: [] as string[],
            howToApply: "",
          };
        }
        return {
          id: recommendation.opportunity.id,
          html: page.html,
          similarIds: parseSimilarOpportunityIds(page.html, recommendation.opportunity.id),
          howToApply: parseListingHowToApply(page.html),
        };
      },
    );

    const howToApplyById = new Map(listingResults.map((item) => [item.id, item.howToApply]));
    const similarIds = [...new Set(listingResults.flatMap((item) => item.similarIds))]
      .filter((id) => !records.some((record) => record.id === `grants-${id}`))
      .slice(0, MAX_SIMILAR_IDS);

    if (similarIds.length) {
      const placeholders: CurrentOpportunityRecord[] = similarIds.map((id) => ({
        kind: "current_opportunity",
        id: `grants-${id}`,
        opportunityNumber: "",
        title: "",
        agency: "",
        status: "posted",
        openDate: "",
        deadline: "",
        assistanceListings: [],
        description: "",
        detailStatus: "not-requested",
        source: {
          sourceId: id,
          sourceName: "Grants.gov public opportunity APIs",
          sourceUrl: `https://www.grants.gov/search-results-detail/${id}`,
          retrievedAt: (dependencies.now ?? (() => new Date()))().toISOString(),
          factState: "current",
          snapshotStatus: "live",
        },
      }));
      toolCalls += placeholders.length;
      const similarEnrichment = await enrichGrantRecords(placeholders, {
        fetcher: dependencies.grantsDetailFetcher ?? fetcher,
        now: dependencies.now,
        maxRecords: placeholders.length,
        concurrency: LISTING_CONCURRENCY,
      });
      records = [...records, ...similarEnrichment.records];
      const similarDiscovery = discoverOpportunities(company, records, ranker);
      const extra = similarDiscovery.recommendations.filter((recommendation) =>
        !nextDiscovery.recommendations.some((current) => current.opportunity.id === recommendation.opportunity.id));
      nextDiscovery = {
        ...nextDiscovery,
        recommendations: [...nextDiscovery.recommendations, ...extra].slice(0, 20),
        resultMeta: {
          ...nextDiscovery.resultMeta,
          returnedCount: Math.min(20, nextDiscovery.recommendations.length + extra.length),
          qualifyingCount: similarDiscovery.resultMeta.qualifyingCount,
        },
      };
    }

    const similarById = new Map<string, NonNullable<DiscoveryRecommendation["similarOpportunities"]>>();
    for (const listing of listingResults) {
      const refs = listing.similarIds.flatMap((id) => {
        const record = records.find((item) => item.id === `grants-${id}`);
        if (!record || !record.title) return [];
        similarOpportunityCount += 1;
        return [{
          id: record.id,
          opportunityNumber: record.opportunityNumber,
          title: record.title,
          agency: record.agency,
          sourceUrl: record.source.sourceUrl,
          retrievedAt: record.source.retrievedAt,
        }];
      });
      similarById.set(listing.id, refs);
    }

    return {
      discovery: attachPrefill(nextDiscovery, howToApplyById, similarById),
      records,
      researchPass: {
        attempted: true,
        completed: Date.now() - started <= timeoutMs,
        durationMs: Date.now() - started,
        toolCalls,
        similarOpportunityCount,
        costEstimateUsd: null,
        reason: Date.now() - started > timeoutMs ? "timeout" : null,
      },
    };
  } catch {
    return {
      discovery: attachPrefill(nextDiscovery, new Map(), new Map()),
      records,
      researchPass: {
        attempted: true,
        completed: false,
        durationMs: Date.now() - started,
        toolCalls,
        similarOpportunityCount,
        costEstimateUsd: null,
        reason: "provider_error",
      },
    };
  }
}
