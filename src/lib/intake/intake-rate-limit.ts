import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

interface RateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

export type IntakeAuthorization = "allowed" | "rate_limited" | "unavailable";

export interface IntakeRateLimitDependencies {
  loadEnvironment?: () => Promise<Record<string, unknown>>;
}

async function cloudflareEnvironment() {
  const context = await getCloudflareContext({ async: true });
  return context.env as Record<string, unknown>;
}

export async function authorizeIntakeRequest(
  request: Request,
  dependencies: IntakeRateLimitDependencies = {},
): Promise<IntakeAuthorization> {
  try {
    const env = await (dependencies.loadEnvironment ?? cloudflareEnvironment)();
    const routeLimiter = env.OPPORTUNITY_SEARCH_CLIENT_LIMITER as RateLimitBinding | undefined;
    const clientLimiter = env.OPPORTUNITY_SEMANTIC_CLIENT_LIMITER as RateLimitBinding | undefined;
    const globalLimiter = env.OPPORTUNITY_SEMANTIC_GLOBAL_LIMITER as RateLimitBinding | undefined;
    if (!routeLimiter || !clientLimiter || !globalLimiter) return "unavailable";

    const clientKey = request.headers.get("cf-connecting-ip")?.trim() || "unknown-client";
    const route = await routeLimiter.limit({ key: `intake:${clientKey}` });
    if (!route.success) return "rate_limited";
    const client = await clientLimiter.limit({ key: `intake-extraction:${clientKey}` });
    if (!client.success) return "rate_limited";
    const global = await globalLimiter.limit({ key: "intake-extraction:global" });
    return global.success ? "allowed" : "rate_limited";
  } catch {
    return "unavailable";
  }
}

export function withIntakeRateLimit(
  handler: (request: Request) => Promise<Response>,
  dependencies: IntakeRateLimitDependencies = {},
) {
  return async function POST(request: Request) {
    const authorization = await authorizeIntakeRequest(request, dependencies);
    if (authorization === "rate_limited") {
      return NextResponse.json(
        { error: "Intake rate limit exceeded. Try again in one minute." },
        { status: 429 },
      );
    }
    if (authorization === "unavailable" && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Intake protection is unavailable. Try again shortly." },
        { status: 503 },
      );
    }
    return handler(request);
  };
}
