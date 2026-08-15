import type {
  ProgramContextRecord,
  SourceAdapterOptions,
  SourceResult,
} from "./source-contracts";

const SOURCE_NAME = "SAM.gov / Open GSA Assistance Listings";
const SOURCE_URL = "https://open.gsa.gov/api/assistance-listings/";
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
  apiKey?: string;
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function payloadRecords(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.results)) return root.results;
  if (Array.isArray(root.data)) return root.data;
  if (root.data && typeof root.data === "object") {
    const nested = root.data as Record<string, unknown>;
    if (Array.isArray(nested.results)) return nested.results;
    if (Array.isArray(nested.listings)) return nested.listings;
  }
  return Array.isArray(root.listings) ? root.listings : [];
}

function sourceFor(
  assistanceListing: string,
  retrievedAt: string,
  snapshotStatus: "live" | "cached_official_snapshot",
): ProgramContextRecord["source"] {
  return {
    sourceId: assistanceListing,
    sourceName: SOURCE_NAME,
    sourceUrl: `https://sam.gov/fal/${encodeURIComponent(assistanceListing)}`,
    retrievedAt,
    factState: "current",
    snapshotStatus,
    note: snapshotStatus === "live"
      ? "Program definition only. This is not an open funding notice."
      : "Audited official program snapshot retrieved August 14, 2026. This is not an open funding notice.",
  };
}

export function normalizeAssistanceListingsPayload(
  payload: unknown,
  retrievedAt: string,
): ProgramContextRecord[] {
  return payloadRecords(payload).flatMap((value): ProgramContextRecord[] => {
    if (!value || typeof value !== "object") return [];
    const record = value as Record<string, unknown>;
    const assistanceListing =
      text(record.program_number) ||
      text(record.programNumber) ||
      text(record.assistanceListingNumber) ||
      text(record.assistance_listing_number) ||
      text(record.number);
    const title =
      text(record.program_title) ||
      text(record.programTitle) ||
      text(record.title);
    if (!/^\d{2}\.\d{3}$/.test(assistanceListing) || !title) return [];
    return [{
      kind: "program_context",
      id: `assistance-${assistanceListing}`,
      assistanceListing,
      title,
      agency:
        text(record.agency_name) ||
        text(record.agencyName) ||
        text(record.agency),
      objective:
        text(record.objectives) ||
        text(record.objective) ||
        text(record.description),
      source: sourceFor(assistanceListing, retrievedAt, "live"),
    }];
  });
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
      source: sourceFor(record.assistanceListing, SNAPSHOT_RETRIEVED_AT, "cached_official_snapshot"),
    }));
}

export async function searchAssistanceListings(
  input: AssistanceListingsSearchInput,
  options: AssistanceListingsOptions = {},
): Promise<SourceResult<ProgramContextRecord>> {
  const retrievedAt = (options.now ?? (() => new Date()))().toISOString();
  const fallback = cachedRecords(input);
  const base = { source: SOURCE_NAME, sourceUrl: SOURCE_URL, retrievedAt } as const;
  if (options.mode === "cached") {
    return {
      ...base,
      status: "cached",
      records: fallback,
      warning: "Live retrieval was not requested. Showing the audited August 14, 2026 program snapshot.",
    };
  }
  if (options.mode === "failure" || !options.apiKey) {
    return {
      ...base,
      status: "cached-fallback",
      records: fallback,
      warning: options.mode === "failure"
        ? "Simulated upstream failure. Showing the audited official program snapshot."
        : "The Open GSA API key is not configured. Showing the audited official program snapshot.",
    };
  }

  return {
    ...base,
    status: "cached-fallback",
    records: fallback,
    warning: "The published Assistance Listings endpoint requires schema verification before live use. Showing the audited official program snapshot.",
  };
}
