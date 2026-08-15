import { NextResponse } from "next/server";
import {
  normalizeFounderProfile,
  type FounderProfileInput,
} from "@/lib/intake/profile-normalization";
import { searchGovernmentSources } from "@/lib/opportunity-search";
import type { SourceMode } from "@/lib/sources/source-contracts";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function founderProfileInput(value: unknown): FounderProfileInput | null {
  if (!value || typeof value !== "object") return null;
  const profile = value as Record<string, unknown>;
  const description = text(profile.description);
  if (!description) return null;
  return {
    id: text(profile.id) || text(profile.demoKey) || "founder-profile",
    companyName: text(profile.companyName),
    website: text(profile.website),
    description,
    industry: text(profile.industry),
    technology: text(profile.technology),
    location: text(profile.location),
    capitalNeed: text(profile.capitalNeed),
    useOfFunds: text(profile.useOfFunds),
    customers: text(profile.customers),
    researchActivities: text(profile.researchActivities),
    applicantType: text(profile.applicantType),
    samStatus: text(profile.samStatus),
    uei: text(profile.uei),
  };
}

function sourceMode(value: unknown): SourceMode | undefined {
  return value === "cached" || value === "failure" ? value : undefined;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    const parsed = (await request.json()) as unknown;
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const input = founderProfileInput(body.profile);
  if (!input) {
    return NextResponse.json(
      { error: "A confirmed company description is required." },
      { status: 400 },
    );
  }

  const result = await searchGovernmentSources(
    normalizeFounderProfile(input),
    {
      mode: sourceMode(body.mode),
    },
  );
  return NextResponse.json(result);
}
