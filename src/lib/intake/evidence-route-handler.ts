import { NextResponse } from "next/server";
import { EXTERNAL_PROCESSING_DISCLOSURE } from "./external-processing";
import {
  extractFounderEvidence,
  type FounderEvidenceSourceType,
  type LunaExtractionDependencies,
} from "./luna-extraction";
import { createEvidenceOnlyFounderProfile } from "./profile-normalization";

const MAX_REQUEST_BODY_BYTES = 64 * 1024;
const MAX_EVIDENCE_TEXT_BYTES = 24_000;
const MAX_SOURCE_URL_BYTES = 2_048;
const SUPPORTED_PROFILE_FIELDS = new Set([
  "companyName",
  "description",
  "industry",
  "technology",
  "location",
  "yearFounded",
  "employees",
  "revenue",
  "capitalRaised",
  "capitalNeed",
  "useOfFunds",
  "customers",
  "researchActivities",
  "applicantType",
  "legalEntityType",
  "ownership",
  "productStage",
  "researchStage",
  "smallBusinessStatus",
  "usEntityStatus",
  "samStatus",
  "uei",
]);

type EvidenceSourceType = Extract<FounderEvidenceSourceType, "manual" | "pdf">;

async function requestBody(request: Request) {
  const contentLength = request.headers.get("content-length");
  const declaredLength = contentLength === null ? Number.NaN : Number(contentLength);
  if (
    Number.isFinite(declaredLength)
    && declaredLength > MAX_REQUEST_BODY_BYTES
  ) {
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

function sourceUrl(sourceType: EvidenceSourceType, suppliedSourceUrl: string) {
  if (suppliedSourceUrl) return suppliedSourceUrl;
  switch (sourceType) {
    case "manual":
      return "urn:founder-evidence:manual";
    case "pdf":
      return "urn:founder-evidence:pdf";
    default: {
      const exhaustiveSourceType: never = sourceType;
      return exhaustiveSourceType;
    }
  }
}

export function createEvidencePost(
  lunaDependencies: LunaExtractionDependencies = {},
) {
  return async function POST(request: Request) {
    const parsedBody = await requestBody(request);
    if (parsedBody.status === "too-large") {
      return NextResponse.json(
        { error: "Request body is too large." },
        { status: 413 },
      );
    }
    if (parsedBody.status !== "ok") {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    const body = parsedBody.value;
    if (body.sourceType !== "manual" && body.sourceType !== "pdf") {
      return NextResponse.json(
        { error: "Source type must be manual or pdf." },
        { status: 400 },
      );
    }
    if (typeof body.evidenceText !== "string" || !body.evidenceText.trim()) {
      return NextResponse.json(
        { error: "Evidence text is required." },
        { status: 400 },
      );
    }

    const evidenceText = body.evidenceText.trim();
    if (new TextEncoder().encode(evidenceText).byteLength > MAX_EVIDENCE_TEXT_BYTES) {
      return NextResponse.json(
        { error: "Evidence text is too large." },
        { status: 413 },
      );
    }
    if (
      body.sourceUrl !== undefined
      && (
        typeof body.sourceUrl !== "string"
        || new TextEncoder().encode(body.sourceUrl.trim()).byteLength
          > MAX_SOURCE_URL_BYTES
      )
    ) {
      return NextResponse.json(
        { error: "Source URL is invalid." },
        { status: 400 },
      );
    }

    const evidenceSourceUrl = sourceUrl(
      body.sourceType,
      typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "",
    );
    const extraction = await extractFounderEvidence({
      sourceType: body.sourceType,
      evidenceText,
      sourceUrl: evidenceSourceUrl,
    }, lunaDependencies);
    const baseProfile = createEvidenceOnlyFounderProfile(evidenceText);
    const proposed = extraction.proposedProfile;
    const profile = {
      ...baseProfile,
      ...(proposed.companyName ? { companyName: proposed.companyName } : {}),
      description: proposed.description || baseProfile.description,
      industry: proposed.industry || baseProfile.industry,
      technology: proposed.technology || baseProfile.technology,
      location: proposed.location || baseProfile.location,
      yearFounded: proposed.yearFounded || baseProfile.yearFounded,
      employees: proposed.employees || baseProfile.employees,
      revenue: proposed.revenue || baseProfile.revenue,
      capitalRaised: proposed.capitalRaised || baseProfile.capitalRaised,
      capitalNeed: proposed.capitalNeed || baseProfile.capitalNeed,
      useOfFunds: proposed.useOfFunds || baseProfile.useOfFunds,
      customers: proposed.customers || baseProfile.customers,
      researchActivities:
        proposed.researchActivities || baseProfile.researchActivities,
      applicantType: proposed.applicantType || baseProfile.applicantType,
      legalEntityType: proposed.legalEntityType || baseProfile.legalEntityType,
      ownership: proposed.ownership || baseProfile.ownership,
      productStage: proposed.productStage || baseProfile.productStage,
      researchStage: proposed.researchStage || baseProfile.researchStage,
      smallBusinessStatus:
        proposed.smallBusinessStatus || baseProfile.smallBusinessStatus,
      usEntityStatus: proposed.usEntityStatus || baseProfile.usEntityStatus,
      samStatus: proposed.samStatus || baseProfile.samStatus,
      uei: proposed.uei || baseProfile.uei,
    };

    return NextResponse.json({
      profile,
      evidence: extraction.evidence.filter((claim) =>
        SUPPORTED_PROFILE_FIELDS.has(claim.field)),
      warning: extraction.externalProcessing.completed
        ? "OpenAI suggestions are limited to submitted evidence. Confirm every field before matching."
        : "OpenAI suggestions were unavailable. Continue with the editable evidence-only profile and confirm every field before matching.",
      externalProcessing: extraction.externalProcessing,
      externalProcessingDisclosure: EXTERNAL_PROCESSING_DISCLOSURE,
    });
  };
}
