import type {
  HistoricalAwardRecord,
  SourceAdapterOptions,
  SourceResult,
} from "./source-contracts";
import { SBIR_AWARDS_CSV_URL } from "./sbir-ingestion";
import type {
  SbirAwardsSnapshotMetadata,
  SbirAwardsStore,
  SbirHistoricalAwardEntry,
} from "./sbir-store";

const SOURCE_NAME = "SBIR.gov historical awards";

export interface SbirAwardsOptions extends SourceAdapterOptions {
  store?: SbirAwardsStore;
}

function searchTerms(keyword: string) {
  const normalized = keyword.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  if (!normalized) return [];
  return [
    normalized,
    ...normalized.split(/[^a-z0-9]+/).filter((term) => term.length >= 3),
  ];
}

function sourceNote(metadata: SbirAwardsSnapshotMetadata) {
  return `Official monthly SBIR.gov cached bulk snapshot; source file retrieved ${metadata.retrievedAt} and last modified ${metadata.lastModified ?? "not supplied"}. Historical award only. It is not an open solicitation.`;
}

function historicalRecord(
  award: SbirHistoricalAwardEntry,
  metadata: SbirAwardsSnapshotMetadata,
): HistoricalAwardRecord {
  return {
    kind: "historical_award",
    id: `sbir-${award.recordKey}`,
    title: award.title,
    agency: award.agency,
    branch: award.branch,
    program: award.program,
    phase: award.phase,
    recipient: award.company,
    amount: award.amount,
    startDate: award.startDate || award.awardYear,
    endDate: award.endDate || award.awardYear,
    assistanceListing: "",
    description: "",
    researchKeywords: award.researchKeywords,
    source: {
      sourceId: award.awardId,
      sourceName: SOURCE_NAME,
      sourceUrl: award.awardUrl,
      retrievedAt: metadata.retrievedAt,
      factState: "historical",
      snapshotStatus: "cached_official_snapshot",
      note: sourceNote(metadata),
    },
  };
}

export async function searchSbirAwards(
  keyword: string,
  options: SbirAwardsOptions = {},
): Promise<SourceResult<HistoricalAwardRecord>> {
  const retrievedAt = (options.now ?? (() => new Date()))().toISOString();
  const base = {
    source: SOURCE_NAME,
    sourceUrl: SBIR_AWARDS_CSV_URL,
    retrievedAt,
  } as const;
  if (options.mode === "cached" || options.mode === "failure") {
    return {
      ...base,
      status: options.mode === "cached" ? "cached" : "unavailable",
      records: [],
      warning: options.mode === "cached"
        ? "No SBIR.gov award is bundled for this query. No historical award is being substituted."
        : "The SBIR historical-award snapshot is unavailable. No historical award is being substituted.",
    };
  }
  if (!keyword.trim()) {
    return {
      ...base,
      status: "unavailable",
      records: [],
      warning: "No specific company concept was available for an SBIR.gov award search.",
    };
  }

  try {
    const metadata = options.store ? await options.store.metadata() : null;
    if (metadata && options.store) {
      const records = await options.store.searchByTerms(searchTerms(keyword), 20);
      return {
        ...base,
        retrievedAt: metadata.retrievedAt,
        status: "cached",
        records: records.map((record) => historicalRecord(record, metadata)),
        warning: `Showing the official cached SBIR historical-award snapshot last modified ${metadata.lastModified ?? "at an unknown time"}.`,
      };
    }
  } catch {
    return {
      ...base,
      status: "unavailable",
      records: [],
      warning: "The SBIR historical-award snapshot store is unavailable. No historical award is being substituted.",
    };
  }

  return {
    ...base,
    status: "cached-fallback",
    records: [],
    warning: "No ingested SBIR historical-award snapshot is configured. No historical award is being substituted.",
  };
}
