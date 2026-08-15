import { NextResponse } from "next/server";
import { EXTERNAL_PROCESSING_DISCLOSURE } from "./external-processing";
import {
  extractFounderEvidence,
  type LunaExtractionDependencies,
} from "./luna-extraction";

const MAX_HTML_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 7_000;

const entityMap: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeHtml(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (entity, name: string) => entityMap[name] ?? entity);
}

function cleanText(value: string) {
  return decodeHtml(value)
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(html: string) {
  return cleanText(
    html
      .replace(/<(script|style|noscript|svg|template)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|p|div|li|section|article|h[1-6])\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function findMeta(html: string, names: string[]) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
        "i",
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`,
        "i",
      ),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return cleanText(match[1]);
    }
  }
  return "";
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function validatePublicHttps(rawUrl: string) {
  const parsed = new URL(rawUrl);
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (parsed.protocol !== "https:") {
    throw new Error("Use a public HTTPS website.");
  }
  if (parsed.username || parsed.password || (parsed.port && parsed.port !== "443")) {
    throw new Error("That website address is not supported.");
  }
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "::1" ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("fe80") ||
    isPrivateIpv4(hostname)
  ) {
    throw new Error("Use a public company website.");
  }

  return parsed;
}

function inferConcepts(text: string) {
  const conceptGroups: Array<[string, string[]]> = [
    ["Artificial intelligence", ["artificial intelligence", "machine learning", " ai "]],
    ["Healthcare technology", ["healthcare", "hospital", "clinical", "nurse", "patient"]],
    ["Cybersecurity", ["cybersecurity", "threat detection", "security platform"]],
    ["Advanced manufacturing", ["advanced manufacturing", "aerospace", "lightweight component"]],
    ["Water technology", ["water loss", "water sensor", "municipal water", "water infrastructure"]],
    ["Workforce technology", ["workforce", "labor productivity", "employee training"]],
  ];
  const normalized = ` ${text.toLowerCase()} `;
  return conceptGroups
    .filter(([, terms]) => terms.some((term) => normalized.includes(term)))
    .map(([label]) => label)
    .slice(0, 5);
}

function inferYearFounded(text: string) {
  const match = text.match(/(?:founded|established|since)\s+(?:in\s+)?((?:19|20)\d{2})/i);
  return match?.[1] ?? "";
}

export interface WebsiteEvidenceSnapshot {
  profile: {
    companyName: string;
    website: string;
    description: string;
    industry: string;
    technology: string;
    yearFounded: string;
  };
  evidence: Array<{ field: string; value: string; sourceUrl: string }>;
  retrievedAt: string;
  sourceUrl: string;
  evidenceText: string;
  warning: string;
}

export async function fetchWebsiteEvidence(
  rawUrl: string,
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<WebsiteEvidenceSnapshot> {
  const requestedUrl = validatePublicHttps(rawUrl.trim());
  const response = await fetcher(requestedUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "OpportunityMap/0.1 founder-profile-intake",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`The website returned ${response.status}.`);
  }

  validatePublicHttps(response.url || requestedUrl.toString());
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new Error("That address did not return a webpage.");
  }

  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_HTML_BYTES) {
    throw new Error("That webpage is too large to review safely.");
  }

  const html = (await response.text()).slice(0, MAX_HTML_BYTES);
  const title = cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const description = findMeta(html, ["description", "og:description", "twitter:description"]);
  const pageText = stripHtml(html).slice(0, 24_000);
  const companyName =
    findMeta(html, ["og:site_name", "application-name"]) ||
    title.split(/\s+[|·—-]\s+/)[0]?.trim() ||
    requestedUrl.hostname.replace(/^www\./, "");
  const concepts = inferConcepts(`${description} ${pageText}`);
  const sourceUrl = response.url || requestedUrl.toString();
  const profile = {
    companyName,
    website: sourceUrl,
    description: description || pageText.slice(0, 420),
    industry: concepts[0] ?? "",
    technology: concepts.join(", "),
    yearFounded: inferYearFounded(pageText),
  };
  const evidence = [
    ...(companyName
      ? [{ field: "Company name", value: companyName, sourceUrl }]
      : []),
    ...(description
      ? [{ field: "Company description", value: description, sourceUrl }]
      : []),
  ];
  return {
    profile,
    evidence,
    retrievedAt: now().toISOString(),
    sourceUrl,
    evidenceText: pageText,
    warning:
      "Website facts are suggestions only. Confirm every field before matching; unsupported facts remain unknown.",
  };
}

export function createWebsitePost(
  fetcher: typeof fetch = fetch,
  lunaDependencies: LunaExtractionDependencies = {},
) {
  return async function POST(request: Request) {
    try {
      const body = (await request.json()) as {
        url?: unknown;
        externalProcessingConsent?: unknown;
      };
      if (typeof body.url !== "string" || !body.url.trim()) {
        return NextResponse.json({ error: "Enter a company website." }, { status: 400 });
      }

      const snapshot = await fetchWebsiteEvidence(body.url, fetcher);
      const {
        evidenceText,
        sourceUrl,
        ...baseResult
      } = snapshot;

      if (body.externalProcessingConsent !== true) {
        return NextResponse.json(baseResult);
      }

      const extraction = await extractFounderEvidence({
        sourceType: "website",
        evidenceText,
        sourceUrl,
        externalProcessingConsent: true,
      }, lunaDependencies);
      const proposed = extraction.proposedProfile;

      return NextResponse.json({
        ...baseResult,
        profile: {
          ...baseResult.profile,
          companyName: proposed.companyName || baseResult.profile.companyName,
          description: proposed.description || baseResult.profile.description,
          industry: proposed.industry || baseResult.profile.industry,
          technology: proposed.technology || baseResult.profile.technology,
          yearFounded: proposed.yearFounded || baseResult.profile.yearFounded,
        },
        evidence: [
          ...baseResult.evidence,
          ...extraction.evidence
            .filter(({ field }) =>
              field === "companyName" ||
              field === "description" ||
              field === "industry" ||
              field === "technology" ||
              field === "yearFounded"
            )
            .map((claim) => ({
              field: claim.field,
              value: claim.value,
              evidenceExcerpt: claim.evidenceExcerpt,
              sourceUrl: claim.sourceUrl,
            })),
        ],
        externalProcessing: extraction.externalProcessing,
        externalProcessingDisclosure: EXTERNAL_PROCESSING_DISCLOSURE,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The website could not be reviewed.";
      return NextResponse.json(
        {
          error: message,
          fallback: "Paste a plain-language company description instead.",
        },
        { status: 422 },
      );
    }
  };
}
