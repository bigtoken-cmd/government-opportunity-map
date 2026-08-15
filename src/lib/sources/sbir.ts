import type {
  HistoricalAwardRecord,
  SourceAdapterOptions,
  SourceResult,
} from "./source-contracts";

const SOURCE_NAME = "SBIR.gov Awards API";
const SOURCE_URL = "https://www.sbir.gov/api";

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function amount(value: unknown) {
  const parsed = Number(text(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordsFrom(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.results)) return root.results;
  if (Array.isArray(root.awards)) return root.awards;
  return [];
}

export function normalizeSbirAwardsPayload(
  payload: unknown,
  retrievedAt: string,
): HistoricalAwardRecord[] {
  return recordsFrom(payload).flatMap((value): HistoricalAwardRecord[] => {
    if (!value || typeof value !== "object") return [];
    const award = value as Record<string, unknown>;
    const sourceId =
      text(award.contract) ||
      text(award.award_id) ||
      text(award.id);
    const title =
      text(award.award_title) ||
      text(award.title);
    const recipient =
      text(award.firm) ||
      text(award.company) ||
      text(award.recipient);
    if (!sourceId || !title || !recipient) return [];
    const sourceUrl = text(award.award_link).startsWith("https://")
      ? text(award.award_link)
      : `${SOURCE_URL}?keyword=${encodeURIComponent(sourceId)}`;
    const description = text(award.abstract) || text(award.description);
    const year = text(award.award_year);
    return [{
      kind: "historical_award",
      id: `sbir-${sourceId}`,
      title,
      agency: text(award.agency) || text(award.branch),
      recipient,
      amount: amount(award.award_amount),
      startDate: year,
      endDate: year,
      assistanceListing: "",
      description,
      source: {
        sourceId,
        sourceName: SOURCE_NAME,
        sourceUrl,
        retrievedAt,
        factState: "historical",
        snapshotStatus: "live",
        note: "Historical SBIR/STTR award record only. It is not an open solicitation.",
      },
    }];
  });
}

export async function searchSbirAwards(
  keyword: string,
  options: SourceAdapterOptions = {},
): Promise<SourceResult<HistoricalAwardRecord>> {
  const retrievedAt = (options.now ?? (() => new Date()))().toISOString();
  const base = { source: SOURCE_NAME, sourceUrl: SOURCE_URL, retrievedAt } as const;
  if (options.mode === "cached" || options.mode === "failure") {
    return {
      ...base,
      status: options.mode === "cached" ? "cached" : "cached-fallback",
      records: [],
      warning: "No SBIR.gov award is bundled for this query. No historical record is being substituted.",
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

  return {
    ...base,
    status: "cached-fallback",
    records: [],
    warning: "The published SBIR.gov API routes returned 404 during verification. No historical award is being substituted.",
  };
}
