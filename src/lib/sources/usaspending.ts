import type {
  HistoricalAwardRecord,
  SourceAdapterOptions,
  SourceResult,
} from "./source-contracts";

const SOURCE_NAME = "USAspending.gov Spending by Award API";
const SOURCE_URL = "https://api.usaspending.gov/api/v2/search/spending_by_award/";
const SNAPSHOT_RETRIEVED_AT = "2026-08-14T00:00:00.000Z";

const OFFICIAL_SNAPSHOT: readonly Omit<HistoricalAwardRecord, "source">[] = [
  {
    kind: "historical_award",
    id: "usaspending-ASST_NON_R01EB016414_075",
    title: "IMPLANTABLE MULTI-ANALYTE SENSORS FOR THE CONTINUOUS MONITORING OF BODY CHEMISTRI",
    agency: "Department of Health and Human Services",
    recipient: "PROFUSA, INC.",
    amount: 4_881_972,
    startDate: "2012-09-15",
    endDate: "2016-06-30",
    assistanceListing: "93.310",
    description: "IMPLANTABLE MULTI-ANALYTE SENSORS FOR THE CONTINUOUS MONITORING OF BODY CHEMISTRI",
  },
] as const;

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = typeof value === "string" ? Number(value.replace(/[$,]/g, "")) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function sourceFor(
  sourceId: string,
  sourceUrl: string,
  retrievedAt: string,
  snapshotStatus: "live" | "cached_official_snapshot",
): HistoricalAwardRecord["source"] {
  return {
    sourceId,
    sourceName: SOURCE_NAME,
    sourceUrl,
    retrievedAt,
    factState: "historical",
    snapshotStatus,
    note: snapshotStatus === "live"
      ? "Historical prime award only. This is not open funding and does not prove current eligibility."
      : "Audited historical award snapshot retrieved August 14, 2026. This is not open funding.",
  };
}

function isValidUsaSpendingPayload(payload: unknown): payload is { results: unknown[] } {
  return Boolean(payload)
    && typeof payload === "object"
    && Array.isArray((payload as Record<string, unknown>).results);
}

export function normalizeUsaSpendingPayload(
  payload: unknown,
  assistanceListing: string,
  retrievedAt: string,
): HistoricalAwardRecord[] {
  if (!payload || typeof payload !== "object") return [];
  const results = (payload as Record<string, unknown>).results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((value): HistoricalAwardRecord[] => {
    if (!value || typeof value !== "object") return [];
    const award = value as Record<string, unknown>;
    const awardId = text(award["Award ID"]);
    const recipient = text(award["Recipient Name"]);
    const programNumber = text(award["CFDA Number"]);
    const internalId = text(award.generated_internal_id);
    if (!awardId || !recipient || !internalId || programNumber !== assistanceListing) return [];
    const description = text(award.Description);
    const sourceUrl = `https://www.usaspending.gov/award/${encodeURIComponent(internalId)}/`;
    return [{
      kind: "historical_award",
      id: `usaspending-${internalId}`,
      title: description || awardId,
      agency: text(award["Awarding Agency"]),
      recipient,
      amount: finiteNumber(award["Award Amount"]),
      startDate: text(award["Start Date"]),
      endDate: text(award["End Date"]),
      assistanceListing: programNumber,
      description,
      source: sourceFor(awardId, sourceUrl, retrievedAt, "live"),
    }];
  });
}

function cachedRecords(assistanceListing: string): HistoricalAwardRecord[] {
  return OFFICIAL_SNAPSHOT
    .filter((record) => record.assistanceListing === assistanceListing)
    .map((record) => ({
      ...record,
      source: sourceFor(
        "R01EB016414",
        "https://www.usaspending.gov/award/ASST_NON_R01EB016414_075/",
        SNAPSHOT_RETRIEVED_AT,
        "cached_official_snapshot",
      ),
    }));
}

export async function searchUsaSpending(
  assistanceListing: string,
  options: SourceAdapterOptions = {},
): Promise<SourceResult<HistoricalAwardRecord>> {
  const retrievedAt = (options.now ?? (() => new Date()))().toISOString();
  const fallback = cachedRecords(assistanceListing);
  const base = { source: SOURCE_NAME, sourceUrl: SOURCE_URL, retrievedAt } as const;
  if (!/^\d{2}\.\d{3}$/.test(assistanceListing)) {
    return {
      ...base,
      status: "unavailable",
      records: [],
      warning: "No validated Assistance Listing was available for a historical-award query.",
    };
  }
  if (options.mode === "cached") {
    return {
      ...base,
      status: "cached",
      records: fallback,
      warning: "Live retrieval was not requested. Showing the audited August 14, 2026 historical snapshot.",
    };
  }
  if (options.mode === "failure") {
    return {
      ...base,
      status: "cached-fallback",
      records: fallback,
      warning: "Simulated upstream failure. Showing the audited historical snapshot.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await (options.fetcher ?? fetch)(SOURCE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subawards: false,
        limit: 10,
        page: 1,
        filters: {
          award_type_codes: ["02", "03", "04", "05"],
          time_period: [{ start_date: "2007-10-01", end_date: retrievedAt.slice(0, 10) }],
          program_numbers: [assistanceListing],
          recipient_type_names: ["category_business"],
        },
        fields: [
          "Award ID",
          "Recipient Name",
          "Start Date",
          "End Date",
          "Award Amount",
          "Awarding Agency",
          "Award Type",
          "Description",
          "CFDA Number",
          "generated_internal_id",
        ],
        sort: "Award Amount",
        order: "desc",
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`USAspending.gov returned ${response.status}`);
    const payload = await response.json();
    if (!isValidUsaSpendingPayload(payload)) {
      return {
        ...base,
        status: "unavailable",
        records: [],
        warning: "USAspending.gov returned a malformed or incomplete response. No live records are being shown.",
      };
    }
    return {
      ...base,
      status: "live",
      records: normalizeUsaSpendingPayload(payload, assistanceListing, retrievedAt),
      warning: null,
    };
  } catch {
    return {
      ...base,
      status: "cached-fallback",
      records: fallback,
      warning: "USAspending.gov could not be reached or validated within twelve seconds. Showing the audited historical snapshot.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
