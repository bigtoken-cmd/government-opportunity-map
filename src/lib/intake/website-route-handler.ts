import { NextResponse } from "next/server";
import { EXTERNAL_PROCESSING_DISCLOSURE } from "./external-processing";
import {
  extractFounderEvidence,
  type LunaExtractionDependencies,
} from "./luna-extraction";
import { inferFounderProfileFields } from "./profile-normalization";

const MAX_HTML_BYTES = 250_000;
const MAX_WEBSITE_PAGES = 6;
const MAX_PAGE_EVIDENCE_CHARACTERS = 6_000;
const MAX_WEBSITE_EVIDENCE_CHARACTERS = 32_000;
const MAX_SCRIPT_BYTES = 750_000;
const MAX_SCRIPT_EVIDENCE_CHARACTERS = 20_000;
const MAX_LINK_CANDIDATES = 200;
const MAX_REDIRECTS = 2;
const MAX_URL_CHARACTERS = 2_048;
const WEBSITE_REVIEW_TIMEOUT_MS = 15_000;

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

function removeElementBlocks(html: string, tag: string) {
  const lower = html.toLocaleLowerCase("en-US");
  const closing = `</${tag}>`;
  let cursor = 0;
  let output = "";
  while (cursor < html.length) {
    const start = lower.indexOf(`<${tag}`, cursor);
    if (start < 0) return output + html.slice(cursor);
    output += html.slice(cursor, start);
    const end = lower.indexOf(closing, start + tag.length + 1);
    if (end < 0) return output;
    cursor = end + closing.length;
  }
  return output;
}

function stripHtml(html: string) {
  let visible = html;
  for (const tag of ["script", "style", "noscript", "svg", "template"]) {
    visible = removeElementBlocks(visible, tag);
  }
  return cleanText(
    visible
      .replace(/<(?:br|p|div|li|section|article|h[1-6])\b[^>]{0,2000}>/gi, "\n")
      .replace(/<[^>]{0,2000}>/g, " "),
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
  if (
    parts.length !== 4
    || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) return false;
  return (
    parts[0] === 0
    || parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 0 && parts[2] === 0)
    || (parts[0] === 192 && parts[1] === 0 && parts[2] === 2)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19))
    || (parts[0] === 198 && parts[1] === 51 && parts[2] === 100)
    || (parts[0] === 203 && parts[1] === 0 && parts[2] === 113)
    || parts[0] >= 224
  );
}

export function normalizePublicWebsiteUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("Enter a valid company website.");
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");

  if (normalized.length > MAX_URL_CHARACTERS || parsed.toString().length > MAX_URL_CHARACTERS) {
    throw new Error("That website address is too long.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Use a public HTTPS website.");
  }
  if (parsed.username || parsed.password || (parsed.port && parsed.port !== "443")) {
    throw new Error("That website address is not supported.");
  }
  if (
    hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".internal")
    || hostname.includes(":")
    || isPrivateIpv4(hostname)
  ) {
    throw new Error("Use a public company website.");
  }

  parsed.hash = "";
  return parsed;
}

function equivalentWebsiteOrigin(left: URL, right: URL) {
  const hostname = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, "");
  return left.protocol === right.protocol
    && left.port === right.port
    && hostname(left) === hostname(right);
}

async function readBoundedText(
  response: Response,
  maximumBytes: number,
  tooLargeMessage: string,
) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(tooLargeMessage);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

async function fetchPublicUrl(
  requestedUrl: URL,
  fetcher: typeof fetch,
  headers: HeadersInit,
  signal: AbortSignal,
  allowedOrigin = requestedUrl.origin,
  allowWwwEquivalent = false,
) {
  const origin = new URL(allowedOrigin);
  let current = normalizePublicWebsiteUrl(requestedUrl.toString());
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    if (
      current.origin !== origin.origin
      && !(allowWwwEquivalent && equivalentWebsiteOrigin(current, origin))
    ) throw new Error("Website redirects must stay on the same company domain.");

    const response = await fetcher(current, {
      headers,
      redirect: "manual",
      signal,
    });
    const reportedUrl = response.url
      ? normalizePublicWebsiteUrl(response.url)
      : current;
    if (
      reportedUrl.origin !== origin.origin
      && !(allowWwwEquivalent && equivalentWebsiteOrigin(reportedUrl, origin))
    ) throw new Error("Website redirects must stay on the same company domain.");

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, finalUrl: reportedUrl };
    }
    const location = response.headers.get("location");
    if (!location) throw new Error("The website returned an invalid redirect.");
    current = normalizePublicWebsiteUrl(new URL(location, reportedUrl).toString());
  }
  throw new Error("The website redirected too many times.");
}

interface FetchedWebsitePage {
  url: string;
  html: string;
  title: string;
  description: string;
  text: string;
}

async function fetchHtmlPage(
  requestedUrl: URL,
  fetcher: typeof fetch,
  signal: AbortSignal,
  allowedOrigin = requestedUrl.origin,
  allowWwwEquivalent = false,
): Promise<FetchedWebsitePage> {
  const { response, finalUrl } = await fetchPublicUrl(
    requestedUrl,
    fetcher,
    {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "OpportunityMap/0.1 founder-profile-intake",
    },
    signal,
    allowedOrigin,
    allowWwwEquivalent,
  );
  if (!response.ok) throw new Error(`The website returned ${response.status}.`);

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new Error("That address did not return a webpage.");
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_HTML_BYTES) {
    throw new Error("That webpage is too large to review safely.");
  }

  const html = await readBoundedText(
    response,
    MAX_HTML_BYTES,
    "That webpage is too large to review safely.",
  );
  return {
    url: finalUrl.toString(),
    html,
    title: cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""),
    description: findMeta(html, ["description", "og:description", "twitter:description"]),
    text: stripHtml(html),
  };
}

interface InternalLinkCandidate {
  url: URL;
  anchorText: string;
  occurrences: number;
  inPrimaryNavigation: boolean;
  firstSeen: number;
}

function linkPriority(candidate: InternalLinkCandidate) {
  const { url, anchorText, occurrences, inPrimaryNavigation } = candidate;
  const value = `${url.pathname} ${anchorText}`.toLowerCase();
  const purposeGroups = [
    [50, ["about", "company", "team", "leadership", "mission", "story", "who we are"]],
    [48, ["solution", "product", "service", "platform", "technology", "capabilit", "what we do"]],
    [44, ["industr", "customer", "case stud", "use case", "market", "who we serve"]],
    [40, ["research", "science", "publication", "resource", "insight"]],
    [34, ["compliance", "security", "trust", "responsib"]],
  ] as const;
  const lowValueTerms = [
    "privacy", "terms", "cookie", "legal", "login", "sign in", "sign up",
    "cart", "checkout", "contact", "career", "jobs", "press", "news", "blog",
  ];
  const purpose = purposeGroups.find(([, terms]) => terms.some((term) => value.includes(term)))?.[0] ?? 0;
  const depth = url.pathname.split("/").filter(Boolean).length;
  const shortDescriptiveAnchor = anchorText.length >= 3 && anchorText.length <= 80 ? 12 : 0;
  const structure = (inPrimaryNavigation ? 60 : 0)
    + Math.min(occurrences, 4) * 10
    + (depth === 1 ? 32 : depth === 2 ? 18 : 4)
    + shortDescriptiveAnchor;
  const lowValuePenalty = lowValueTerms.some((term) => value.includes(term)) ? 90 : 0;
  const articlePenalty = /\/(?:19|20)\d{2}(?:\/|$)/.test(url.pathname) || depth > 3 ? 35 : 0;
  return structure + purpose - lowValuePenalty - articlePenalty;
}

function primaryNavigationRanges(html: string) {
  const lower = html.toLocaleLowerCase("en-US");
  const ranges: Array<readonly [number, number]> = [];
  for (const tag of ["nav", "header"]) {
    let cursor = 0;
    while (cursor < html.length && ranges.length < 20) {
      const start = lower.indexOf(`<${tag}`, cursor);
      if (start < 0) break;
      const openEnd = lower.indexOf(">", start + tag.length + 1);
      if (openEnd < 0 || openEnd - start > 2_000) break;
      const close = lower.indexOf(`</${tag}>`, openEnd + 1);
      if (close < 0) break;
      ranges.push([start, close + tag.length + 3] as const);
      cursor = close + tag.length + 3;
    }
  }
  return ranges;
}

function htmlLinkCandidates(html: string, rootUrl: string) {
  const root = new URL(rootUrl);
  const blocked = /\.(?:pdf|png|jpe?g|gif|svg|webp|zip|docx?|pptx?)$/i;
  const primaryRanges = primaryNavigationRanges(html);
  const candidates = new Map<string, InternalLinkCandidate>();
  const linkPattern = /<a\b[^>]{0,2000}\bhref\s*=\s*(?:["']([^"']{1,2048})["']|([^\s>]{1,2048}))[^>]{0,2000}>/gi;
  let inspectedLinks = 0;
  for (const match of html.matchAll(linkPattern)) {
    inspectedLinks += 1;
    if (inspectedLinks > 400) break;
    const href = match[1] || match[2] || "";
    if (!href || href.length > MAX_URL_CHARACTERS) continue;
    try {
      const url = normalizePublicWebsiteUrl(new URL(href, root).toString());
      url.search = "";
      url.hash = "";
      if (
        url.origin !== root.origin
        || url.pathname === root.pathname
        || blocked.test(url.pathname)
      ) continue;

      const canonical = url.toString();
      const existing = candidates.get(canonical);
      if (!existing && candidates.size >= MAX_LINK_CANDIDATES) continue;
      const index = match.index ?? Number.MAX_SAFE_INTEGER;
      const following = html.slice(index + match[0].length, index + match[0].length + 500);
      const closingAnchor = following.toLocaleLowerCase("en-US").indexOf("</a>");
      const anchorText = closingAnchor >= 0 ? stripHtml(following.slice(0, closingAnchor)) : "";
      const inPrimaryNavigation = primaryRanges.some(([start, end]) => index >= start && index < end);
      candidates.set(canonical, existing
        ? {
            ...existing,
            anchorText: existing.anchorText.length >= anchorText.length ? existing.anchorText : anchorText,
            occurrences: existing.occurrences + 1,
            inPrimaryNavigation: existing.inPrimaryNavigation || inPrimaryNavigation,
          }
        : {
            url,
            anchorText,
            occurrences: 1,
            inPrimaryNavigation,
            firstSeen: index,
          });
    } catch {
      // Ignore malformed, non-HTTPS, and non-public navigation targets.
    }
  }
  return [...candidates.values()];
}

async function sitemapLinkCandidates(
  rootUrl: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
) {
  const root = new URL(rootUrl);
  const sitemapUrl = new URL("/sitemap.xml", root);
  try {
    const { response } = await fetchPublicUrl(
      sitemapUrl,
      fetcher,
      {
        Accept: "application/xml,text/xml,text/plain",
        "User-Agent": "OpportunityMap/0.1 founder-profile-intake",
      },
      signal,
      root.origin,
    );
    if (!response.ok) return [];
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_HTML_BYTES) return [];
    const xml = await readBoundedText(
      response,
      MAX_HTML_BYTES,
      "The website sitemap is too large to review safely.",
    );
    const candidates: InternalLinkCandidate[] = [];
    for (const match of xml.matchAll(/<loc\b[^>]{0,500}>([^<]{1,2048})<\/loc>/gi)) {
      if (candidates.length >= MAX_LINK_CANDIDATES) break;
      try {
        const rawLocation = cleanText(match[1]);
        if (rawLocation.length > MAX_URL_CHARACTERS) continue;
        const url = normalizePublicWebsiteUrl(rawLocation);
        url.search = "";
        url.hash = "";
        if (
          url.origin !== root.origin
          || url.pathname === root.pathname
          || /\.(?:xml|pdf|png|jpe?g|gif|svg|webp|zip|docx?|pptx?)$/i.test(url.pathname)
        ) continue;
        candidates.push({
          url,
          anchorText: decodeURIComponent(url.pathname)
            .replace(/[-_/]+/g, " ")
            .trim(),
          occurrences: 1,
          inPrimaryNavigation: false,
          firstSeen: match.index ?? Number.MAX_SAFE_INTEGER,
        });
      } catch {
        // Ignore malformed and cross-origin sitemap entries.
      }
    }
    return candidates;
  } catch {
    return [];
  }
}

function selectInternalLinks(candidates: readonly InternalLinkCandidate[]) {
  const unique = new Map<string, InternalLinkCandidate>();
  for (const candidate of candidates) {
    const key = candidate.url.toString();
    const existing = unique.get(key);
    if (!existing || linkPriority(candidate) > linkPriority(existing)) unique.set(key, candidate);
  }
  return [...unique.values()]
    .sort((left, right) =>
      linkPriority(right) - linkPriority(left)
      || left.firstSeen - right.firstSeen
      || left.url.toString().localeCompare(right.url.toString()))
    .slice(0, MAX_WEBSITE_PAGES - 1)
    .map(({ url }) => url);
}

function decodeJavascriptString(value: string) {
  return cleanText(value
    .replace(/\\u\{([0-9a-f]+)\}/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_match, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_match, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\n|\\r|\\t/g, " ")
    .replace(/\\([\\"'`])/g, "$1"));
}

function readableStringScore(value: string) {
  if (value.includes("${") || /https?:\/\/|data:|sourceMappingURL/i.test(value)) return -1;
  const words = value.match(/[A-Za-z][A-Za-z'-]{1,}/g) ?? [];
  if (words.length < 4) return -1;
  const letters = (value.match(/[A-Za-z]/g) ?? []).length;
  if (letters / Math.max(value.length, 1) < 0.55) return -1;
  const businessLike = /\b(?:we|our|company|build|provide|enable|help|serve|customer|product|platform|system|research|data|technology|training|team|industry|solution)\b/i.test(value);
  const codeCharacters = (value.match(/[{}[\]=<>;]/g) ?? []).length;
  const utilityCharacters = (value.match(/[:/_-]/g) ?? []).length;
  if (codeCharacters > 2 || (!businessLike && utilityCharacters > 3)) return -1;
  const businessLanguage = businessLike ? 20 : 0;
  const sentenceShape = /[.!?:]/.test(value) ? 8 : 0;
  const usefulLength = value.length >= 45 && value.length <= 420 ? 8 : 0;
  return Math.min(words.length, 30) + businessLanguage + sentenceShape + usefulLength;
}

function extractReadableJavascriptText(javascript: string) {
  const candidates: Array<{ text: string; score: number; index: number }> = [];
  const pattern = /(["'`])((?:\\.|(?!\1)[^\\\r\n]){20,600})\1/g;
  for (const match of javascript.matchAll(pattern)) {
    const text = decodeJavascriptString(match[2]);
    const score = readableStringScore(text);
    if (score >= 0) candidates.push({ text, score, index: match.index ?? 0 });
  }
  const seen = new Set<string>();
  let remaining = MAX_SCRIPT_EVIDENCE_CHARACTERS;
  return candidates
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .flatMap(({ text }) => {
      const key = text.toLocaleLowerCase("en-US");
      if (seen.has(key) || remaining <= 0) return [];
      seen.add(key);
      const bounded = text.slice(0, remaining);
      remaining -= bounded.length;
      return [bounded];
    })
    .join("\n");
}

async function fetchClientApplicationEvidence(
  html: string,
  rootUrl: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
) {
  const root = new URL(rootUrl);
  const assets: URL[] = [];
  for (const match of html.matchAll(/<script\b[^>]{0,2000}\bsrc\s*=\s*["']([^"']{1,2048})["'][^>]{0,2000}>/gi)) {
    if (match[1].length > MAX_URL_CHARACTERS) continue;
    try {
      const url = normalizePublicWebsiteUrl(new URL(match[1], root).toString());
      if (url.origin !== root.origin || !/\.m?js(?:$|\?)/i.test(url.toString())) continue;
      if (!assets.some((candidate) => candidate.toString() === url.toString())) assets.push(url);
      if (assets.length >= 2) break;
    } catch {
      // Ignore malformed and cross-origin application assets.
    }
  }

  const results = await Promise.all(assets.map(async (asset) => {
    try {
      const { response, finalUrl } = await fetchPublicUrl(
        asset,
        fetcher,
        {
          Accept: "text/javascript,application/javascript",
          "User-Agent": "OpportunityMap/0.1 founder-profile-intake",
        },
        signal,
        root.origin,
      );
      if (!response.ok) return null;
      const declaredLength = Number(response.headers.get("content-length") ?? "0");
      if (declaredLength > MAX_SCRIPT_BYTES) return null;
      const javascript = await readBoundedText(
        response,
        MAX_SCRIPT_BYTES,
        "The client application asset is too large to review safely.",
      );
      const text = extractReadableJavascriptText(javascript);
      return text ? { url: finalUrl.toString(), text } : null;
    } catch {
      return null;
    }
  }));
  const completed = results.filter((result): result is { url: string; text: string } => Boolean(result));
  return {
    evidenceText: completed
      .map(({ url, text }) => `[FIRST-PARTY CLIENT APPLICATION TEXT: ${url}]\n${text}`)
      .join("\n\n"),
    reviewedAssets: completed.map(({ url }) => url),
  };
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
  reviewedUrls: string[];
  reviewedAssets: string[];
  warning: string;
}

export async function fetchWebsiteEvidence(
  rawUrl: string,
  fetcher: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): Promise<WebsiteEvidenceSnapshot> {
  const requestedUrl = normalizePublicWebsiteUrl(rawUrl);
  const reviewSignal = AbortSignal.timeout(WEBSITE_REVIEW_TIMEOUT_MS);
  const rootPage = await fetchHtmlPage(
    requestedUrl,
    fetcher,
    reviewSignal,
    requestedUrl.origin,
    true,
  );
  const sourceUrl = rootPage.url;
  const rootOrigin = new URL(sourceUrl).origin;
  const htmlLinks = htmlLinkCandidates(rootPage.html, sourceUrl);
  const usefulHtmlLinks = htmlLinks.filter((candidate) => linkPriority(candidate) >= 60);
  const sitemapLinks = usefulHtmlLinks.length < MAX_WEBSITE_PAGES - 1
    ? await sitemapLinkCandidates(sourceUrl, fetcher, reviewSignal)
    : [];
  const internalLinks = selectInternalLinks([...htmlLinks, ...sitemapLinks]);
  const fetchedPages = await Promise.allSettled(
    internalLinks.map((url) => fetchHtmlPage(
      url,
      fetcher,
      reviewSignal,
      rootOrigin,
    )),
  );
  const pages = [
    rootPage,
    ...fetchedPages.flatMap((result) =>
      result.status === "fulfilled" && new URL(result.value.url).origin === rootOrigin
        ? [result.value]
        : []),
  ];
  const pageEvidenceText = pages
    .map((websitePage) => [
      `[WEBSITE PAGE: ${websitePage.url}]`,
      websitePage.description ? `Page description: ${websitePage.description}` : "",
      websitePage.text.slice(0, MAX_PAGE_EVIDENCE_CHARACTERS),
    ].filter(Boolean).join("\n"))
    .join("\n\n");
  const inferenceText = pages
    .map(({ description, text }) => `${description}\n${text}`)
    .join("\n");
  const distinctPageText = [...new Set(pages.map(({ text }) => text))].join(" ");
  const clientApplication = distinctPageText.length < 1_500 && !reviewSignal.aborted
    ? await fetchClientApplicationEvidence(rootPage.html, sourceUrl, fetcher, reviewSignal)
    : { evidenceText: "", reviewedAssets: [] };
  const evidenceText = [pageEvidenceText, clientApplication.evidenceText]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_WEBSITE_EVIDENCE_CHARACTERS);
  const companyName =
    findMeta(rootPage.html, ["og:site_name", "application-name"]) ||
    rootPage.title.split(/\s+[|·—-]\s+/)[0]?.trim() ||
    requestedUrl.hostname.replace(/^www\./, "");
  const inferred = inferFounderProfileFields(inferenceText);
  const profile = {
    companyName,
    website: sourceUrl,
    description: rootPage.description || rootPage.text.slice(0, 420),
    industry: inferred.industry,
    technology: inferred.technology,
    yearFounded: inferYearFounded(inferenceText),
  };
  const evidence = [
    ...(companyName
      ? [{ field: "Company name", value: companyName, sourceUrl }]
      : []),
    ...(rootPage.description
      ? [{ field: "Company description", value: rootPage.description, sourceUrl }]
      : []),
  ];
  return {
    profile,
    evidence,
    retrievedAt: now().toISOString(),
    sourceUrl,
    evidenceText,
    reviewedUrls: pages.map(({ url }) => url),
    reviewedAssets: clientApplication.reviewedAssets,
    warning: [
      `Reviewed ${pages.length} first-party website page${pages.length === 1 ? "" : "s"}`,
      clientApplication.reviewedAssets.length
        ? ` and ${clientApplication.reviewedAssets.length} first-party client application asset${clientApplication.reviewedAssets.length === 1 ? "" : "s"}`
        : "",
      ". Confirm every field before matching; unsupported facts remain unknown.",
    ].join(""),
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
