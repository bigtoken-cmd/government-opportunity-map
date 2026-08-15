import { normalizeConcepts } from "../concept-normalization";
import type {
  CurrentOpportunityRecord,
  SourceAdapterOptions,
  SourceResult,
} from "./source-contracts";

export interface GrantsSearchInput {
  keyword?: string;
  opportunityNumber?: string;
}

const SOURCE_NAME = "Grants.gov public opportunity APIs";
const SOURCE_URL = "https://api.grants.gov/v1/api/search2";
const DETAIL_SOURCE_URL = "https://api.grants.gov/v1/api/fetchOpportunity";
const SNAPSHOT_RETRIEVED_AT = "2026-08-14T00:00:00.000Z";

const OFFICIAL_SNAPSHOT: readonly Omit<CurrentOpportunityRecord, "source">[] = [
  {
    kind: "current_opportunity",
    id: "grants-359671",
    opportunityNumber: "PA-27-100",
    title: "NIH, CDC and FDA Small Business Innovation Research Grant (Parent SBIR [R43/R44] Clinical Trial Optional)",
    agency: "National Institutes of Health",
    openDate: "05/28/2026",
    deadline: "04/05/2027",
    status: "posted",
    assistanceListings: [],
    description: "",
  },
  {
    kind: "current_opportunity",
    id: "grants-359666",
    opportunityNumber: "RFA-RM-27-013",
    title: "Model-to-Clinic (M2C) for Precision Medicine with AI: Integrating Imaging with Multimodal Data (PRIMED-AI) (UG3/UH3, Clinical Trial Optional)",
    agency: "National Institutes of Health",
    openDate: "06/30/2026",
    deadline: "10/19/2026",
    status: "posted",
    assistanceListings: ["93.310"],
    description: "",
  },
  {
    kind: "current_opportunity",
    id: "grants-306824",
    opportunityNumber: "PD-19-088Y",
    title: "Advanced Manufacturing",
    agency: "U.S. National Science Foundation",
    openDate: "07/06/2018",
    deadline: "",
    status: "posted",
    assistanceListings: ["47.041"],
    description: "",
  },
  {
    kind: "current_opportunity",
    id: "grants-360954",
    opportunityNumber: "NNH26ZTR001N",
    title: "Space Technology Research, Development, Demonstration, and Infusion (SpaceTech REDDI-2026)",
    agency: "NASA Headquarters",
    openDate: "12/09/2025",
    deadline: "",
    status: "posted",
    assistanceListings: ["43.012"],
    description: "",
  },
  {
    kind: "current_opportunity",
    id: "grants-357554",
    opportunityNumber: "25-515",
    title: "Security, Privacy, and Trust in Cyberspace",
    agency: "U.S. National Science Foundation",
    openDate: "12/06/2024",
    deadline: "09/28/2026",
    status: "posted",
    assistanceListings: ["47.049", "47.070", "47.075", "47.076"],
    description: "",
  },
  {
    kind: "current_opportunity",
    id: "grants-362396",
    opportunityNumber: "R26AS00079",
    title: "Title XVI Water Reclamation and Reuse Projects",
    agency: "Bureau of Reclamation",
    openDate: "05/14/2026",
    deadline: "08/26/2027",
    status: "posted",
    assistanceListings: ["15.504"],
    description: "",
  },
] as const;

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string" || typeof item === "number") return text(item);
      if (!item || typeof item !== "object") return "";
      const record = item as Record<string, unknown>;
      return text(record.programNumber) || text(record.number) || text(record.cfda);
    })
    .filter(Boolean);
}

function isValidGrantsPayload(payload: unknown): payload is {
  errorcode: number | string;
  data: { oppHits: unknown[] };
} {
  if (!payload || typeof payload !== "object") return false;
  const root = payload as Record<string, unknown>;
  return Number(root.errorcode) === 0
    && Boolean(root.data)
    && typeof root.data === "object"
    && Array.isArray((root.data as Record<string, unknown>).oppHits);
}

function sourceFor(
  sourceId: string,
  sourceUrl: string,
  retrievedAt: string,
  snapshotStatus: "live" | "cached_official_snapshot",
): CurrentOpportunityRecord["source"] {
  return {
    sourceId,
    sourceName: SOURCE_NAME,
    sourceUrl,
    retrievedAt,
    factState: "current",
    snapshotStatus,
    ...(snapshotStatus === "cached_official_snapshot"
      ? { note: "Audited official snapshot retrieved August 14, 2026. Verify the current notice before acting." }
      : {}),
  };
}

function cachedRecords(input: GrantsSearchInput): CurrentOpportunityRecord[] {
  const opportunityNumber = input.opportunityNumber?.trim().toLocaleLowerCase("en-US");
  const keyword = input.keyword?.trim().toLocaleLowerCase("en-US");
  if (!opportunityNumber && !keyword) return [];
  const queryConcepts = normalizeConcepts(keyword ?? "");
  const queryTerms = [
    ...queryConcepts.missionAreas,
    ...queryConcepts.exactTerms,
    ...queryConcepts.controlledConcepts,
    ...queryConcepts.technologyAndRd,
    ...queryConcepts.customerUses,
  ];
  return OFFICIAL_SNAPSHOT
    .filter((record) => {
      if (opportunityNumber) {
        return record.opportunityNumber.toLocaleLowerCase("en-US") === opportunityNumber;
      }
      if (!keyword) return true;
      const recordText = `${record.title} ${record.agency} ${record.opportunityNumber}`;
      if (recordText.toLocaleLowerCase("en-US").includes(keyword)) return true;
      const recordConcepts = normalizeConcepts(recordText);
      const recordTerms = new Set([
        ...recordConcepts.missionAreas,
        ...recordConcepts.exactTerms,
        ...recordConcepts.controlledConcepts,
        ...recordConcepts.technologyAndRd,
        ...recordConcepts.customerUses,
      ]);
      return queryTerms.some((term) => recordTerms.has(term));
    })
    .map((record) => ({
      ...record,
      detailStatus: record.detailStatus ?? "not-requested",
      source: sourceFor(
        record.id.replace(/^grants-/, ""),
        `https://www.grants.gov/search-results-detail/${encodeURIComponent(record.id.replace(/^grants-/, ""))}`,
        SNAPSHOT_RETRIEVED_AT,
        "cached_official_snapshot",
      ),
    }));
}

export function normalizeGrantsPayload(
  payload: unknown,
  retrievedAt: string,
): CurrentOpportunityRecord[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Number(root.errorcode) !== 0) return [];
  if (!root.data || typeof root.data !== "object") return [];
  const hits = (root.data as Record<string, unknown>).oppHits;
  if (!Array.isArray(hits)) return [];

  return hits.flatMap((value): CurrentOpportunityRecord[] => {
    if (!value || typeof value !== "object") return [];
    const hit = value as Record<string, unknown>;
    const sourceId = text(hit.id);
    const opportunityNumber = text(hit.number);
    const title = text(hit.title);
    if (!sourceId || !opportunityNumber || !title) return [];
    return [{
      kind: "current_opportunity",
      id: `grants-${sourceId}`,
      opportunityNumber,
      title,
      agency: text(hit.agency) || text(hit.agencyName),
      openDate: text(hit.openDate),
      deadline: text(hit.closeDate),
      status: text(hit.oppStatus),
      assistanceListings: stringList(hit.cfdaList).length
        ? stringList(hit.cfdaList)
        : stringList(hit.alnist),
      description: text(hit.synopsis) || text(hit.description),
      detailStatus: "not-requested",
      source: sourceFor(
        sourceId,
        `https://www.grants.gov/search-results-detail/${encodeURIComponent(sourceId)}`,
        retrievedAt,
        "live",
      ),
    }];
  });
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value.replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  if (/^(true|yes|y)$/i.test(value.trim())) return true;
  if (/^(false|no|n)$/i.test(value.trim())) return false;
  return undefined;
}

function descriptions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): string[] => {
    if (typeof item === "string") return item.trim() ? [item.trim()] : [];
    if (!item || typeof item !== "object") return [];
    const description = text((item as Record<string, unknown>).description);
    return description ? [description] : [];
  });
}

function plainText(value: unknown) {
  return text(value)
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const isoPrefix = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoPrefix) return isoPrefix;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : raw;
}

function assistanceListings(value: Record<string, unknown>) {
  const records = Array.isArray(value.cfdas)
    ? value.cfdas
    : Array.isArray(value.alns)
      ? value.alns
      : [];
  return records.flatMap((item): string[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const number = text(record.alnNumber)
      || text(record.cfdaNumber)
      || text(record.assistanceListingNumber)
      || text(record.programNumber)
      || text(record.number);
    return /^\d{2}\.\d{3}$/.test(number) ? [number] : [];
  });
}

export function normalizeGrantsDetailPayload(
  payload: unknown,
  record: CurrentOpportunityRecord,
  retrievedAt: string,
): CurrentOpportunityRecord | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (Number(root.errorcode) !== 0 || !root.data || typeof root.data !== "object") {
    return null;
  }
  const data = root.data as Record<string, unknown>;
  const sourceId = record.id.replace(/^grants-/, "");
  if (text(data.id) !== sourceId) return null;
  const detailValue = data.synopsis ?? data.forecast;
  if (!detailValue || typeof detailValue !== "object") return null;
  const detail = detailValue as Record<string, unknown>;
  const listings = assistanceListings(data);
  const deadline = normalizedDate(detail.responseDateStr)
    || normalizedDate(detail.responseDate)
    || record.deadline;
  const openDate = normalizedDate(detail.postingDateStr)
    || normalizedDate(detail.postingDate)
    || record.openDate;
  const description = plainText(detail.synopsisDesc)
    || plainText(detail.forecastDesc)
    || record.description;
  const applicationRoute = text(data.assistURL);
  return {
    ...record,
    opportunityNumber: text(data.opportunityNumber) || record.opportunityNumber,
    title: text(data.opportunityTitle) || record.title,
    agency: text(detail.agencyName) || record.agency,
    openDate,
    deadline,
    assistanceListings: listings.length ? listings : record.assistanceListings,
    description,
    detailStatus: "enriched",
    eligibleApplicantTypes: descriptions(detail.applicantTypes),
    additionalEligibility: plainText(detail.applicantEligibilityDesc),
    fundingInstruments: descriptions(detail.fundingInstruments),
    awardFloor: finiteNumber(detail.awardFloor),
    awardCeiling: finiteNumber(detail.awardCeiling),
    estimatedFunding: finiteNumber(detail.estimatedFunding),
    expectedAwards: finiteNumber(detail.numberOfAwards),
    costSharing: booleanValue(detail.costSharing),
    ...(applicationRoute ? { applicationRoute } : {}),
    source: {
      ...record.source,
      retrievedAt,
      snapshotStatus: "live",
      note: "Official notice details retrieved from the Grants.gov fetchOpportunity API. Verify the current package before acting.",
    },
  };
}

export interface GrantsDetailOptions {
  fetcher?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
  maxRecords?: number;
  concurrency?: number;
}

export interface GrantsEnrichmentResult {
  records: readonly CurrentOpportunityRecord[];
  requestedCount: number;
  enrichedCount: number;
  warning: string | null;
}

async function fetchGrantDetail(
  record: CurrentOpportunityRecord,
  options: GrantsDetailOptions,
) {
  const sourceId = record.id.replace(/^grants-/, "");
  const opportunityId = Number(sourceId);
  if (!Number.isFinite(opportunityId)) {
    return { ...record, detailStatus: "unavailable" as const };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 6_000);
  try {
    const response = await (options.fetcher ?? fetch)(DETAIL_SOURCE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return { ...record, detailStatus: "unavailable" as const };
    const normalized = normalizeGrantsDetailPayload(
      await response.json(),
      record,
      (options.now ?? (() => new Date()))().toISOString(),
    );
    return normalized ?? { ...record, detailStatus: "unavailable" as const };
  } catch {
    return { ...record, detailStatus: "unavailable" as const };
  } finally {
    clearTimeout(timeout);
  }
}

export async function enrichGrantRecords(
  records: readonly CurrentOpportunityRecord[],
  options: GrantsDetailOptions = {},
): Promise<GrantsEnrichmentResult> {
  const requested = records.slice(0, options.maxRecords ?? 24);
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 8, 12));
  const enriched: CurrentOpportunityRecord[] = [];
  for (let index = 0; index < requested.length; index += concurrency) {
    enriched.push(...await Promise.all(
      requested.slice(index, index + concurrency)
        .map((record) => fetchGrantDetail(record, options)),
    ));
  }
  const enrichedById = new Map(enriched.map((record) => [record.id, record]));
  const merged = records.map((record) => enrichedById.get(record.id) ?? record);
  const enrichedCount = enriched.filter((record) => record.detailStatus === "enriched").length;
  const unavailableCount = requested.length - enrichedCount;
  return {
    records: merged,
    requestedCount: requested.length,
    enrichedCount,
    warning: unavailableCount
      ? `${unavailableCount} of ${requested.length} bounded Grants.gov detail lookups were unavailable; those notice facts remain unknown.`
      : null,
  };
}

export async function searchGrants(
  input: GrantsSearchInput,
  options: SourceAdapterOptions = {},
): Promise<SourceResult<CurrentOpportunityRecord>> {
  const retrievedAt = (options.now ?? (() => new Date()))().toISOString();
  const fallback = cachedRecords(input);
  const base = {
    source: SOURCE_NAME,
    sourceUrl: SOURCE_URL,
    retrievedAt,
  } as const;
  if (options.mode === "cached") {
    return {
      ...base,
      status: "cached",
      records: fallback,
      warning: "Live retrieval was not requested. Showing the audited August 14, 2026 fallback snapshot.",
    };
  }
  if (options.mode === "failure") {
    return {
      ...base,
      status: "cached-fallback",
      records: fallback,
      warning: "Simulated upstream failure. Showing the audited August 14, 2026 fallback snapshot.",
    };
  }
  if (!input.opportunityNumber?.trim() && !input.keyword?.trim()) {
    return {
      ...base,
      status: "unavailable",
      records: [],
      warning: "No specific company concept was available for a Grants.gov search.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_000);
  try {
    const response = await (options.fetcher ?? fetch)(SOURCE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: 25,
        startRecordNum: 0,
        ...(input.opportunityNumber?.trim()
          ? { oppNum: input.opportunityNumber.trim().slice(0, 80) }
          : { keyword: input.keyword?.trim().slice(0, 120) }),
        oppStatuses: "forecasted|posted",
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Grants.gov returned ${response.status}`);
    const payload = await response.json();
    if (!isValidGrantsPayload(payload)) {
      return {
        ...base,
        status: "unavailable",
        records: [],
        warning: "Grants.gov returned a malformed or incomplete response. No live records are being shown.",
      };
    }
    const records = normalizeGrantsPayload(payload, retrievedAt);
    return {
      ...base,
      status: "live",
      records,
      warning: null,
    };
  } catch {
    return {
      ...base,
      status: "cached-fallback",
      records: fallback,
      warning: "Grants.gov could not be reached or validated within seven seconds. Showing the audited August 14, 2026 fallback snapshot.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
