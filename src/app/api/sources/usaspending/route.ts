import { NextResponse } from "next/server";
import type { SourceMode } from "@/lib/sources/source-contracts";
import { searchUsaSpending } from "@/lib/sources/usaspending";

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function sourceMode(value: unknown): SourceMode | undefined {
  return value === "cached" || value === "failure" ? value : undefined;
}

export async function POST(request: Request) {
  let input: Record<string, unknown>;
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
    input = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const assistanceListing = text(input.assistanceListing).slice(0, 20) || "93.310";
  if (!/^\d{2}\.\d{3}$/.test(assistanceListing)) {
    return NextResponse.json(
      { error: "Assistance Listing must use the format 00.000." },
      { status: 400 },
    );
  }
  const result = await searchUsaSpending(
    assistanceListing,
    { mode: sourceMode(input.mode) },
  );

  return NextResponse.json({
    source: result.source,
    sourceUrl: result.sourceUrl,
    retrievedAt: result.retrievedAt,
    assistanceListing,
    relationship: "Historical awards under the same Assistance Listing provide program context only. They are not open opportunities and do not prove current eligibility.",
    deduplication: "Prime awards only; one normalized row per generated award ID.",
    sourceStatus: result.status,
    records: result.records,
    warning: result.warning,
  });
}
