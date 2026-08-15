import type {
  ProgramContextRecord,
  SourceAdapterOptions,
  SourceResult,
} from "./source-contracts";
import { ASSISTANCE_LISTINGS_CSV_URL } from "./assistance-listings-ingestion";
import type {
  AssistanceListingEntry,
  AssistanceListingsSnapshotMetadata,
  AssistanceListingsStore,
} from "./assistance-listings-store";

const SOURCE_NAME = "SAM.gov Assistance Listings";
const SNAPSHOT_RETRIEVED_AT = "2026-08-14T00:00:00.000Z";

const OFFICIAL_SNAPSHOT: readonly Omit<ProgramContextRecord, "source">[] = [
  {
    kind: "program_context",
    id: "assistance-93.310",
    assistanceListing: "93.310",
    title: "Trans-NIH Research Support",
    agency: "Department of Health and Human Services",
    objective: "",
  },
  {
    kind: "program_context",
    id: "assistance-47.041",
    assistanceListing: "47.041",
    title: "Engineering",
    agency: "National Science Foundation",
    objective: "",
  },
  {
    kind: "program_context",
    id: "assistance-43.012",
    assistanceListing: "43.012",
    title: "Space Technology",
    agency: "National Aeronautics and Space Administration",
    objective: "",
  },
  {
    kind: "program_context",
    id: "assistance-47.075",
    assistanceListing: "47.075",
    title: "Social, Behavioral, and Economic Sciences",
    agency: "National Science Foundation",
    objective: "",
  },
  {
    kind: "program_context",
    id: "assistance-15.504",
    assistanceListing: "15.504",
    title: "Title XVI Water Reclamation and Reuse Program",
    agency: "Department of the Interior",
    objective: "",
  },
] as const;

export interface AssistanceListingsSearchInput {
  assistanceListing?: string;
  keyword?: string;
}

export interface AssistanceListingsOptions extends SourceAdapterOptions {
  store?: AssistanceListingsStore;
}

function sourceFor(
  assistanceListing: string,
  sourceUrl: string,
  retrievedAt: string,
  note: string,
): ProgramContextRecord["source"] {
  return {
    sourceId: assistanceListing,
    sourceName: SOURCE_NAME,
    sourceUrl,
    retrievedAt,
    factState: "current",
    snapshotStatus: "cached_official_snapshot",
    note,
  };
}

function cachedRecords(input: AssistanceListingsSearchInput): ProgramContextRecord[] {
  const listing = input.assistanceListing?.trim();
  const keyword = input.keyword?.trim().toLocaleLowerCase("en-US");
  if (!listing && !keyword) return [];
  return OFFICIAL_SNAPSHOT
    .filter((record) => {
      if (listing) return record.assistanceListing === listing;
      if (!keyword) return true;
      return `${record.title} ${record.agency}`.toLocaleLowerCase("en-US").includes(keyword);
    })
    .map((record) => ({
      ...record,
      source: sourceFor(
        record.assistanceListing,
        "https://sam.gov/content/assistance-listings",
        SNAPSHOT_RETRIEVED_AT,
        "Audited official program snapshot retrieved August 14, 2026. This is not an open funding notice.",
      ),
    }));
}

function searchTerms(keyword: string) {
  const normalized = keyword.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
  if (!normalized) return [];
  return [
    normalized,
    ...normalized.split(/[^a-z0-9]+/).filter((term) => term.length >= 3),
  ];
}

function ingestedSourceNote(metadata: AssistanceListingsSnapshotMetadata) {
  const lastModified = metadata.lastModified ?? "not supplied";
  return `Official Assistance Listings cached CSV snapshot; source file retrieved ${metadata.retrievedAt} and last modified ${lastModified}. Program definition only. This is not an open funding notice.`;
}

function ingestedRecord(
  record: AssistanceListingEntry,
  metadata: AssistanceListingsSnapshotMetadata,
): ProgramContextRecord {
  return {
    kind: "program_context",
    id: `assistance-${record.assistanceListing}`,
    assistanceListing: record.assistanceListing,
    title: record.title,
    agency: record.agency,
    objective: record.objective,
    source: sourceFor(
      record.assistanceListing,
      record.recordUrl,
      metadata.retrievedAt,
      ingestedSourceNote(metadata),
    ),
  };
}

async function ingestedRecords(
  input: AssistanceListingsSearchInput,
  store: AssistanceListingsStore,
) {
  const metadata = await store.metadata();
  if (!metadata) return null;
  const listing = input.assistanceListing?.trim();
  const records = listing
    ? [await store.getById(listing)].filter(
      (record): record is AssistanceListingEntry => record !== null,
    )
    : await store.searchByTerms(searchTerms(input.keyword ?? ""), 20);
  return {
    metadata,
    records: records.map((record) => ingestedRecord(record, metadata)),
  };
}

export async function searchAssistanceListings(
  input: AssistanceListingsSearchInput,
  options: AssistanceListingsOptions = {},
): Promise<SourceResult<ProgramContextRecord>> {
  const retrievedAt = (options.now ?? (() => new Date()))().toISOString();
  const fallback = cachedRecords(input);
  const base = {
    source: SOURCE_NAME,
    sourceUrl: ASSISTANCE_LISTINGS_CSV_URL,
    retrievedAt,
  } as const;
  if (options.mode === "cached") {
    return {
      ...base,
      status: "cached",
      records: fallback,
      warning: "Live retrieval was not requested. Showing the audited August 14, 2026 program snapshot.",
    };
  }
  if (options.mode === "failure") {
    return {
      ...base,
      status: "cached-fallback",
      records: fallback,
      warning: "Simulated snapshot-store failure. Showing the audited official program snapshot.",
    };
  }

  let ingested: Awaited<ReturnType<typeof ingestedRecords>> = null;
  try {
    ingested = options.store
      ? await ingestedRecords(input, options.store)
      : null;
  } catch {
    return {
      ...base,
      status: fallback.length > 0 ? "cached-fallback" : "unavailable",
      records: fallback,
      warning: fallback.length > 0
        ? "The Assistance Listings snapshot store is unavailable. Showing the audited official program snapshot."
        : "The Assistance Listings snapshot store is unavailable, and no validated fallback matched this query.",
    };
  }
  if (ingested) {
    return {
      ...base,
      retrievedAt: ingested.metadata.retrievedAt,
      status: "cached",
      records: ingested.records,
      warning: `Showing the official cached Assistance Listings CSV snapshot last modified ${ingested.metadata.lastModified ?? "at an unknown time"}.`,
    };
  }

  return {
    ...base,
    status: "cached-fallback",
    records: fallback,
    warning: "No ingested Assistance Listings CSV snapshot is configured. Showing the audited official program snapshot.",
  };
}
