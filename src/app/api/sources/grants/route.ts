import { NextResponse } from "next/server";

type SourceMode = "live" | "cached" | "failure";

type NormalizedGrant = {
  opportunityId: string;
  opportunityNumber: string;
  title: string;
  agency: string;
  openDate: string;
  closeDate: string;
  status: string;
  assistanceListings: string[];
  sourceUrl: string;
};

const CACHED_OFFICIAL_RECORDS: readonly NormalizedGrant[] = [
  {
    opportunityId: "359671",
    opportunityNumber: "PA-27-100",
    title: "NIH, CDC and FDA Small Business Innovation Research Grant (Parent SBIR [R43/R44] Clinical Trial Optional)",
    agency: "National Institutes of Health",
    openDate: "05/28/2026",
    closeDate: "04/05/2027",
    status: "posted",
    assistanceListings: [],
    sourceUrl: "https://www.grants.gov/search-results-detail/359671",
  },
  {
    opportunityId: "359666",
    opportunityNumber: "RFA-RM-27-013",
    title: "Model-to-Clinic (M2C) for Precision Medicine with AI: Integrating Imaging with Multimodal Data (PRIMED-AI) (UG3/UH3, Clinical Trial Optional)",
    agency: "National Institutes of Health",
    openDate: "06/30/2026",
    closeDate: "10/19/2026",
    status: "posted",
    assistanceListings: ["93.310"],
    sourceUrl: "https://www.grants.gov/search-results-detail/359666",
  },
  {
    opportunityId: "306824",
    opportunityNumber: "PD-19-088Y",
    title: "Advanced Manufacturing",
    agency: "U.S. National Science Foundation",
    openDate: "07/06/2018",
    closeDate: "",
    status: "posted",
    assistanceListings: ["47.041"],
    sourceUrl: "https://www.grants.gov/search-results-detail/306824",
  },
  {
    opportunityId: "362396",
    opportunityNumber: "R26AS00079",
    title: "Title XVI Water Reclamation and Reuse Projects",
    agency: "Bureau of Reclamation",
    openDate: "05/14/2026",
    closeDate: "08/26/2027",
    status: "posted",
    assistanceListings: ["15.504"],
    sourceUrl: "https://www.grants.gov/search-results-detail/362396",
  },
] as const;

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function fallbackRecords(opportunityNumber: string, keyword: string) {
  if (opportunityNumber) {
    return CACHED_OFFICIAL_RECORDS.filter(
      (record) => record.opportunityNumber.toLowerCase() === opportunityNumber.toLowerCase(),
    );
  }
  if (keyword) {
    const query = keyword.toLowerCase();
    return CACHED_OFFICIAL_RECORDS.filter((record) =>
      `${record.title} ${record.agency} ${record.opportunityNumber}`.toLowerCase().includes(query),
    );
  }
  return CACHED_OFFICIAL_RECORDS;
}

function normalizeHit(value: unknown): NormalizedGrant | null {
  if (!value || typeof value !== "object") return null;
  const hit = value as Record<string, unknown>;
  const opportunityId = text(hit.id);
  const opportunityNumber = text(hit.number);
  const title = text(hit.title);
  if (!opportunityId || !opportunityNumber || !title) return null;
  return {
    opportunityId,
    opportunityNumber,
    title,
    agency: text(hit.agency) || text(hit.agencyName),
    openDate: text(hit.openDate),
    closeDate: text(hit.closeDate),
    status: text(hit.oppStatus),
    assistanceListings: stringList(hit.cfdaList).length ? stringList(hit.cfdaList) : stringList(hit.alnist),
    sourceUrl: `https://www.grants.gov/search-results-detail/${encodeURIComponent(opportunityId)}`,
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

  const opportunityNumber = text(input.opportunityNumber).slice(0, 80);
  const keyword = text(input.keyword).slice(0, 120);
  const requestedMode = text(input.mode);
  const mode: SourceMode = requestedMode === "cached" || requestedMode === "failure" ? requestedMode : "live";
  const cached = fallbackRecords(opportunityNumber, keyword);
  const base = {
    source: "Grants.gov Search2 API",
    sourceUrl: "https://api.grants.gov/v1/api/search2",
    retrievedAt: new Date().toISOString(),
    query: opportunityNumber ? { opportunityNumber } : { keyword },
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
      warning: "Simulated upstream failure. Matching remains available from the labeled audited fallback snapshot.",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_000);
  try {
    const upstream = await fetch("https://api.grants.gov/v1/api/search2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: 10,
        startRecordNum: 0,
        ...(opportunityNumber ? { oppNum: opportunityNumber } : { keyword: keyword || "technology" }),
        oppStatuses: "forecasted|posted|closed|archived",
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!upstream.ok) throw new Error(`Grants.gov returned ${upstream.status}`);
    const payload = (await upstream.json()) as unknown;
    if (!payload || typeof payload !== "object") throw new Error("Grants.gov returned an invalid payload");
    const root = payload as Record<string, unknown>;
    if (root.errorcode !== 0) throw new Error("Grants.gov reported an API error");
    const data = root.data;
    if (!data || typeof data !== "object") throw new Error("Grants.gov response was missing data");
    const hits = (data as Record<string, unknown>).oppHits;
    if (!Array.isArray(hits)) throw new Error("Grants.gov response was missing opportunity records");
    const records = hits.map(normalizeHit).filter((record): record is NormalizedGrant => Boolean(record));
    return NextResponse.json({ ...base, sourceStatus: "live", records, warning: null });
  } catch {
    return NextResponse.json({
      ...base,
      sourceStatus: "cached-fallback",
      records: cached,
      warning: "Grants.gov could not be reached or validated within seven seconds. Showing the audited August 14, 2026 fallback snapshot.",
    });
  } finally {
    clearTimeout(timeout);
  }
}
