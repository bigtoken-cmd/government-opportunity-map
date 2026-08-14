import { NextResponse } from "next/server";

type SourceMode = "live" | "cached" | "failure";

type HistoricalAward = {
  awardId: string;
  recipient: string;
  amount: number;
  startDate: string;
  endDate: string;
  description: string;
  assistanceListing: string;
  awardingAgency: string;
  sourceUrl: string;
};

const CACHED_PROGRAM_AWARDS: readonly HistoricalAward[] = [
  {
    awardId: "R01EB016414",
    recipient: "PROFUSA, INC.",
    amount: 4_881_972,
    startDate: "2012-09-15",
    endDate: "2016-06-30",
    description: "IMPLANTABLE MULTI-ANALYTE SENSORS FOR THE CONTINUOUS MONITORING OF BODY CHEMISTRI",
    assistanceListing: "93.310",
    awardingAgency: "Department of Health and Human Services",
    sourceUrl: "https://www.usaspending.gov/award/ASST_NON_R01EB016414_075/",
  },
] as const;

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeAward(value: unknown, requestedListing: string): HistoricalAward | null {
  if (!value || typeof value !== "object") return null;
  const award = value as Record<string, unknown>;
  const awardId = text(award["Award ID"]);
  const recipient = text(award["Recipient Name"]);
  const assistanceListing = text(award["CFDA Number"]);
  const internalId = text(award.generated_internal_id);
  if (!awardId || !recipient || !internalId || assistanceListing !== requestedListing) return null;
  return {
    awardId,
    recipient,
    amount: number(award["Award Amount"]),
    startDate: text(award["Start Date"]),
    endDate: text(award["End Date"]),
    description: text(award.Description),
    assistanceListing,
    awardingAgency: text(award["Awarding Agency"]),
    sourceUrl: `https://www.usaspending.gov/award/${encodeURIComponent(internalId)}/`,
  };
}

export async function POST(request: Request) {
  let input: Record<string, unknown> = {};
  try {
    const parsed = (await request.json()) as unknown;
    if (parsed && typeof parsed === "object") input = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const assistanceListing = text(input.assistanceListing).slice(0, 20) || "93.310";
  if (!/^\d{2}\.\d{3}$/.test(assistanceListing)) {
    return NextResponse.json({ error: "Assistance Listing must use the format 00.000." }, { status: 400 });
  }
  const requestedMode = text(input.mode);
  const mode: SourceMode = requestedMode === "cached" || requestedMode === "failure" ? requestedMode : "live";
  const cached = CACHED_PROGRAM_AWARDS.filter((award) => award.assistanceListing === assistanceListing);
  const base = {
    source: "USAspending.gov Spending by Award API",
    sourceUrl: "https://api.usaspending.gov/api/v2/search/spending_by_award/",
    retrievedAt: new Date().toISOString(),
    assistanceListing,
    relationship: "Historical awards under the same Assistance Listing provide program context only. They are not open opportunities and do not prove current eligibility.",
    deduplication: "Prime awards only; one normalized row per generated award ID.",
  };

  if (mode === "cached") {
    return NextResponse.json({
      ...base,
      sourceStatus: "cached",
      records: cached,
      warning: "Live retrieval was not requested. Showing the audited August 14, 2026 fallback snapshot.",
    });
  }

  if (mode === "failure") {
    return NextResponse.json({
      ...base,
      sourceStatus: "cached-fallback",
      records: cached,
      warning: "Simulated upstream failure. Historical context remains available from the labeled audited fallback snapshot.",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_000);
  try {
    const upstream = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subawards: false,
        limit: 25,
        page: 1,
        filters: {
          award_type_codes: ["02", "03", "04", "05"],
          time_period: [{ start_date: "2007-10-01", end_date: new Date().toISOString().slice(0, 10) }],
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
    if (!upstream.ok) throw new Error(`USAspending.gov returned ${upstream.status}`);
    const payload = (await upstream.json()) as unknown;
    if (!payload || typeof payload !== "object") throw new Error("USAspending.gov returned an invalid payload");
    const results = (payload as Record<string, unknown>).results;
    if (!Array.isArray(results)) throw new Error("USAspending.gov response was missing award records");
    const records = results
      .map((result) => normalizeAward(result, assistanceListing))
      .filter((record): record is HistoricalAward => Boolean(record));
    return NextResponse.json({ ...base, sourceStatus: "live", records, warning: null });
  } catch {
    return NextResponse.json({
      ...base,
      sourceStatus: "cached-fallback",
      records: cached,
      warning: "USAspending.gov could not be reached or validated within seven seconds. Showing the audited August 14, 2026 fallback snapshot.",
    });
  } finally {
    clearTimeout(timeout);
  }
}
