import { NextResponse } from "next/server";
import { searchGrants } from "@/lib/sources/grants";
import type { SourceMode } from "@/lib/sources/source-contracts";

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

  const opportunityNumber = text(input.opportunityNumber).slice(0, 80);
  const keyword = text(input.keyword).slice(0, 120);
  const result = await searchGrants(
    { opportunityNumber, keyword },
    { mode: sourceMode(input.mode) },
  );

  return NextResponse.json({
    source: result.source,
    sourceUrl: result.sourceUrl,
    retrievedAt: result.retrievedAt,
    query: opportunityNumber ? { opportunityNumber } : { keyword },
    sourceStatus: result.status,
    records: result.records,
    warning: result.warning,
  });
}
