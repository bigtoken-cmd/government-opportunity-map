import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import {
  normalizeFounderProfile,
  type FounderProfileInput,
} from "@/lib/intake/profile-normalization";
import { searchGovernmentSources } from "@/lib/opportunity-search";
import type { SourceMode } from "@/lib/sources/source-contracts";

const MAX_REQUEST_BODY_BYTES = 64 * 1024;

interface RateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

async function requestBody(request: Request) {
  const contentLength = request.headers.get("content-length");
  const declaredLength = contentLength === null ? Number.NaN : Number(contentLength);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
    return { status: "too-large" as const };
  }
  if (!request.body) return { status: "invalid" as const };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { status: "too-large" as const };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? { status: "ok" as const, value: value as Record<string, unknown> }
      : { status: "invalid" as const };
  } catch {
    return { status: "invalid" as const };
  } finally {
    reader.releaseLock();
  }
}

type SemanticAuthorization =
  | "allowed"
  | "rate_limited"
  | "rate_limit_unavailable";

async function authorizeSearchRequest(
  request: Request,
): Promise<{
  route: "allowed" | "rate_limited" | "rate_limit_unavailable";
  semantic: SemanticAuthorization;
}> {
  try {
    const context = await getCloudflareContext({ async: true });
    const env = context.env as Record<string, unknown>;
    const searchLimiter = env.OPPORTUNITY_SEARCH_CLIENT_LIMITER as
      | RateLimitBinding
      | undefined;
    if (!searchLimiter) {
      return { route: "rate_limit_unavailable", semantic: "rate_limit_unavailable" };
    }
    const clientKey = request.headers.get("cf-connecting-ip")?.trim() || "unknown-client";
    const search = await searchLimiter.limit({ key: `opportunity-search:${clientKey}` });
    if (!search.success) {
      return { route: "rate_limited", semantic: "rate_limited" };
    }
    const clientLimiter = env.OPPORTUNITY_SEMANTIC_CLIENT_LIMITER as
      | RateLimitBinding
      | undefined;
    const globalLimiter = env.OPPORTUNITY_SEMANTIC_GLOBAL_LIMITER as
      | RateLimitBinding
      | undefined;
    if (!clientLimiter || !globalLimiter) {
      return { route: "allowed", semantic: "rate_limit_unavailable" };
    }
    const client = await clientLimiter.limit({ key: `semantic-review:${clientKey}` });
    if (!client.success) {
      return { route: "allowed", semantic: "rate_limited" };
    }
    const global = await globalLimiter.limit({ key: "semantic-review:global" });
    return {
      route: "allowed",
      semantic: global.success ? "allowed" : "rate_limited",
    };
  } catch {
    return { route: "rate_limit_unavailable", semantic: "rate_limit_unavailable" };
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function founderProfileInput(value: unknown): FounderProfileInput | null {
  if (!value || typeof value !== "object") return null;
  const profile = value as Record<string, unknown>;
  const description = text(profile.description);
  if (!description) return null;
  return {
    id: text(profile.id) || "founder-profile",
    companyName: text(profile.companyName),
    website: text(profile.website),
    description,
    industry: text(profile.industry),
    technology: text(profile.technology),
    location: text(profile.location),
    yearFounded: text(profile.yearFounded),
    employees: text(profile.employees),
    revenue: text(profile.revenue),
    capitalRaised: text(profile.capitalRaised),
    capitalNeed: text(profile.capitalNeed),
    useOfFunds: text(profile.useOfFunds),
    customers: text(profile.customers),
    researchActivities: text(profile.researchActivities),
    applicantType: text(profile.applicantType),
    legalEntityType: text(profile.legalEntityType),
    ownership: text(profile.ownership),
    productStage: text(profile.productStage),
    researchStage: text(profile.researchStage),
    smallBusinessStatus: text(profile.smallBusinessStatus),
    usEntityStatus: text(profile.usEntityStatus),
    samStatus: text(profile.samStatus),
    uei: text(profile.uei),
  };
}

function sourceMode(value: unknown): SourceMode | undefined {
  return value === "cached" || value === "failure" ? value : undefined;
}

export async function POST(request: Request) {
  const parsed = await requestBody(request);
  if (parsed.status === "too-large") {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
  }
  if (parsed.status !== "ok") {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const body = parsed.value;

  const input = founderProfileInput(body.profile);
  if (!input) {
    return NextResponse.json(
      { error: "A confirmed company description is required." },
      { status: 400 },
    );
  }

  const authorization = await authorizeSearchRequest(request);
  if (authorization.route === "rate_limited") {
    return NextResponse.json(
      { error: "Opportunity search rate limit exceeded. Try again in one minute." },
      { status: 429 },
    );
  }
  if (
    authorization.route === "rate_limit_unavailable"
    && process.env.NODE_ENV === "production"
  ) {
    return NextResponse.json(
      { error: "Opportunity search protection is unavailable. Try again shortly." },
      { status: 503 },
    );
  }
  const result = await searchGovernmentSources(
    normalizeFounderProfile(input),
    {
      mode: sourceMode(body.mode),
      semanticReview: {
        authorizeProviderRequest: async () => authorization.semantic,
      },
    },
  );
  return NextResponse.json(result);
}
