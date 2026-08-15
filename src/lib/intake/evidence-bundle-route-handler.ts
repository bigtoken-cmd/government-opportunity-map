import { NextResponse } from "next/server";
import {
  extractUploadedDocument,
  type IntakeSourceSummary,
  type UploadLike,
} from "./document-extraction";
import { EXTERNAL_PROCESSING_DISCLOSURE } from "./external-processing";
import {
  extractFounderEvidence,
  type FounderEvidenceClaim,
  type FounderEvidenceSourceType,
  type LunaExtractionDependencies,
} from "./luna-extraction";
import {
  createEvidenceOnlyFounderProfile,
  normalizeFounderLocation,
} from "./profile-normalization";
import {
  fetchWebsiteEvidence,
  type WebsiteEvidenceSnapshot,
} from "./website-route-handler";

const MAX_UPLOAD_COUNT = 5;
const MAX_TOTAL_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_MULTIPART_BODY_BYTES = MAX_TOTAL_UPLOAD_BYTES + 1_000_000;
const MAX_COMBINED_EVIDENCE_CHARACTERS = 36_000;
const MAX_MANUAL_CHARACTERS = 8_000;

interface BundleTextSource {
  summary: IntakeSourceSummary;
  text: string;
}

export interface EvidenceBundleDependencies {
  fetcher?: typeof fetch;
  now?: () => Date;
  luna?: LunaExtractionDependencies;
}

async function boundedFormData(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MULTIPART_BODY_BYTES) {
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
      if (totalBytes > MAX_MULTIPART_BODY_BYTES) {
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
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const boundedRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body,
    });
    return {
      status: "ok" as const,
      form: await boundedRequest.formData(),
    };
  } catch {
    return { status: "invalid" as const };
  } finally {
    reader.releaseLock();
  }
}

function formText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isUpload(value: FormDataEntryValue): value is File & UploadLike {
  return typeof value !== "string"
    && typeof value.name === "string"
    && typeof value.size === "number"
    && typeof value.arrayBuffer === "function";
}

function sourceType(value: IntakeSourceSummary["type"]): FounderEvidenceSourceType {
  return value === "website" || value === "pdf" || value === "docx" || value === "pptx"
    ? value
    : "manual";
}

function boundedSources(sources: readonly BundleTextSource[]) {
  const active = sources
    .map((source) => ({ ...source, text: source.text.trim() }))
    .filter((source) => source.text.length > 0);
  if (!active.length) return [];

  const initialShare = Math.floor(MAX_COMBINED_EVIDENCE_CHARACTERS / active.length);
  const bounded = active.map((source) => ({
    ...source,
    text: source.text.slice(0, initialShare),
  }));
  let remaining = MAX_COMBINED_EVIDENCE_CHARACTERS
    - bounded.reduce((total, source) => total + source.text.length, 0);
  return bounded.map((source, index) => {
    if (remaining <= 0) return source;
    const original = active[index].text;
    const extra = original.slice(source.text.length, source.text.length + remaining);
    remaining -= extra.length;
    return { ...source, text: source.text + extra };
  });
}

function combinedEvidence(sources: readonly BundleTextSource[]) {
  return sources.map((source) => [
    `[SOURCE ${source.summary.id} | ${source.summary.type} | ${source.summary.displayName}]`,
    source.text,
  ].join("\n")).join("\n\n");
}

function claimSources(
  claim: FounderEvidenceClaim,
  sources: readonly BundleTextSource[],
) {
  return sources.filter((source) => source.text.includes(claim.evidenceExcerpt));
}

function mergeProfile(
  sources: readonly BundleTextSource[],
  website: WebsiteEvidenceSnapshot | null,
  proposed: Record<string, string>,
) {
  const base = createEvidenceOnlyFounderProfile(
    sources.map((source) => source.text).join("\n\n"),
  );
  const nonWebsiteText = sources
    .filter((source) => source.summary.id !== "website")
    .map((source) => source.text.trim())
    .filter(Boolean);
  const fallbackDescription = website?.profile.description
    ? [website.profile.description, ...nonWebsiteText].join("\n\n").slice(0, 8_000)
    : base.description.slice(0, 8_000);
  const profile: Record<string, string> = {
    ...base,
    description: fallbackDescription,
    ...(website?.profile.companyName
      ? { companyName: website.profile.companyName }
      : {}),
    ...(website?.profile.website ? { website: website.profile.website } : {}),
    ...(website?.profile.industry ? { industry: website.profile.industry } : {}),
    ...(website?.profile.technology ? { technology: website.profile.technology } : {}),
    ...(website?.profile.yearFounded ? { yearFounded: website.profile.yearFounded } : {}),
  };
  for (const [field, value] of Object.entries(proposed)) {
    if (value.trim()) profile[field] = value.trim();
  }
  if (profile.location) profile.location = normalizeFounderLocation(profile.location);
  return profile;
}

function profileFieldOrigins(
  profile: Record<string, string>,
  evidence: ReadonlyArray<FounderEvidenceClaim & {
    sourceId: string;
    sourceIds?: readonly string[];
    sourceTextOrigin?: string;
    sourceTextOrigins?: readonly string[];
  }>,
  website: WebsiteEvidenceSnapshot | null,
  sources: readonly BundleTextSource[],
) {
  const claimByField = new Map(evidence.map((claim) => [claim.field, claim]));
  return Object.fromEntries(Object.entries(profile).map(([field, value]) => {
    const claim = claimByField.get(field as FounderEvidenceClaim["field"]);
    if (claim) {
      const normalized = value !== claim.value;
      return [field, {
        origin: normalized ? "normalized" : "extracted",
        sourceId: claim.sourceId,
        ...(normalized ? { originalValue: claim.value } : {}),
        ...(claim.sourceIds ? { sourceIds: claim.sourceIds } : {}),
        ...(claim.sourceTextOrigin ? { sourceTextOrigin: claim.sourceTextOrigin } : {}),
        ...(claim.sourceTextOrigins ? { sourceTextOrigins: claim.sourceTextOrigins } : {}),
      }];
    }
    if (
      website
      && value
      && ["companyName", "website", "industry", "technology", "yearFounded"].includes(field)
    ) {
      return [field, {
        origin: "extracted",
        sourceId: "website",
        sourceTextOrigin: "server-retrieved",
      }];
    }
    return [field, value && field === "description"
      ? {
          origin: "extracted",
          sourceId: "bundle",
          sourceIds: sources.map((source) => source.summary.id),
          sourceTextOrigins: [...new Set(sources.map((source) => source.summary.textOrigin))],
        }
      : { origin: "unknown" }];
  }));
}

export function createEvidenceBundlePost(
  dependencies: EvidenceBundleDependencies = {},
) {
  return async function POST(request: Request) {
    const parsedForm = await boundedFormData(request);
    if (parsedForm.status === "too-large") {
      return NextResponse.json({ error: "The intake bundle is too large." }, { status: 413 });
    }
    if (parsedForm.status !== "ok") {
      return NextResponse.json(
        { error: "Intake must use multipart form data." },
        { status: 400 },
      );
    }
    const form = parsedForm.form;
    const files = form.getAll("files").filter(isUpload);
    if (files.length > MAX_UPLOAD_COUNT) {
      return NextResponse.json(
        { error: "Upload at most five files." },
        { status: 400 },
      );
    }
    if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "The combined uploads are too large." },
        { status: 413 },
      );
    }
    const suppliedFileTexts = form.getAll("fileText").map((value) =>
      typeof value === "string" ? value : "");
    if (suppliedFileTexts.length > files.length) {
      return NextResponse.json(
        { error: "Uploaded file text does not match the file list." },
        { status: 400 },
      );
    }

    const manualText = formText(form, "manualText").slice(0, MAX_MANUAL_CHARACTERS);
    const websiteUrl = formText(form, "website");
    const uploadTask = (async () => {
      const results = [];
      for (const [index, file] of files.entries()) {
        results.push(await extractUploadedDocument(
          file,
          index,
          suppliedFileTexts[index] ?? "",
        ));
      }
      return results;
    })();
    const [uploadResults, websiteResult] = await Promise.all([
      uploadTask,
      websiteUrl
        ? fetchWebsiteEvidence(
            websiteUrl,
            dependencies.fetcher,
            dependencies.now,
          ).then((snapshot) => ({ snapshot, error: "" }))
          .catch((error: unknown) => ({
            snapshot: null,
            error: error instanceof Error
              ? error.message
              : "The website could not be reviewed.",
          }))
        : Promise.resolve({ snapshot: null, error: "" }),
    ]);

    const allSources: IntakeSourceSummary[] = [];
    const textSources: BundleTextSource[] = [];
    if (websiteUrl) {
      if (websiteResult.snapshot) {
        const websiteSummary: IntakeSourceSummary = {
          id: "website",
          type: "website",
          displayName: websiteResult.snapshot.sourceUrl,
          sourceUrl: websiteResult.snapshot.sourceUrl,
          extractionStatus: "extracted",
          textOrigin: "server-retrieved",
          extractedCharacterCount: websiteResult.snapshot.evidenceText.length,
        };
        allSources.push(websiteSummary);
        textSources.push({ summary: websiteSummary, text: websiteResult.snapshot.evidenceText });
      } else {
        allSources.push({
          id: "website",
          type: "website",
          displayName: websiteUrl,
          sourceUrl: websiteUrl,
          extractionStatus: "needs-paste",
          textOrigin: "none",
          extractedCharacterCount: 0,
          message: `${websiteResult.error} Paste the website summary instead.`,
        });
      }
    }
    if (manualText) {
      const manualSummary: IntakeSourceSummary = {
        id: "manual",
        type: "manual",
        displayName: "Pasted company evidence",
        sourceUrl: "urn:founder-evidence:manual",
        extractionStatus: "provided-text",
        textOrigin: "user-supplied",
        extractedCharacterCount: manualText.length,
      };
      allSources.push(manualSummary);
      textSources.push({ summary: manualSummary, text: manualText });
    }
    for (const result of uploadResults) {
      allSources.push(result.summary);
      if (result.text) textSources.push({ summary: result.summary, text: result.text });
    }

    const bounded = boundedSources(textSources);
    if (!bounded.length) {
      return NextResponse.json({
        error: "No readable evidence was found.",
        fallback: "Paste a plain-language company description and try again.",
        sources: allSources,
      }, { status: 422 });
    }

    const extraction = await extractFounderEvidence({
      sourceType: "manual",
      evidenceText: combinedEvidence(bounded),
      sourceUrl: "urn:founder-evidence:bundle",
    }, dependencies.luna);
    const evidence = extraction.evidence.flatMap((claim) => {
      const sources = claimSources(claim, bounded);
      if (!sources.length) return [];
      const sourceIds = sources.map((source) => source.summary.id);
      const unambiguous = sources.length === 1 ? sources[0] : null;
      return [{
        ...claim,
        sourceId: unambiguous?.summary.id ?? "multiple-sources",
        sourceIds,
        sourceType: unambiguous && unambiguous.summary.textOrigin !== "user-supplied"
          ? sourceType(unambiguous.summary.type)
          : "manual" as const,
        associatedUploadType: unambiguous?.summary.type,
        sourceUrl: unambiguous?.summary.sourceUrl ?? "urn:founder-evidence:bundle",
        sourceTextOrigin: unambiguous?.summary.textOrigin ?? "mixed",
        sourceTextOrigins: [...new Set(sources.map((source) => source.summary.textOrigin))],
      }];
    });
    const profile = mergeProfile(
      bounded,
      websiteResult.snapshot,
      extraction.proposedProfile,
    );
    const warnings = allSources.flatMap((source) => source.message ? [source.message] : []);
    if (evidence.some((claim) => claim.sourceId === "multiple-sources")) {
      warnings.push("One or more extracted facts appeared in multiple sources; all matching source IDs are preserved for review.");
    }
    if (textSources.reduce((total, source) => total + source.text.length, 0)
      > MAX_COMBINED_EVIDENCE_CHARACTERS) {
      warnings.push("Combined evidence was bounded before extraction; review the source list and profile before matching.");
    }

    return NextResponse.json({
      profile,
      profileFieldOrigins: profileFieldOrigins(
        profile,
        evidence,
        websiteResult.snapshot,
        bounded,
      ),
      evidence,
      sources: allSources,
      warnings,
      externalProcessing: extraction.externalProcessing,
      externalProcessingDisclosure: EXTERNAL_PROCESSING_DISCLOSURE,
    });
  };
}
