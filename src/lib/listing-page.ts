const LISTING_PAGE_BASE = "https://www.grants.gov/search-results-detail";

export function grantsListingPageUrl(opportunityId: string) {
  const numericId = opportunityId.replace(/^grants-/, "");
  return `${LISTING_PAGE_BASE}/${numericId}`;
}

export function parseSimilarOpportunityIds(
  html: string,
  currentOpportunityId: string,
): string[] {
  const currentId = currentOpportunityId.replace(/^grants-/, "");
  const similarSection = html.match(/Similar Opportunities[\s\S]{0,12000}/i)?.[0] ?? "";
  const haystack = similarSection || html;
  const ids = [...haystack.matchAll(/search-results-detail\/(\d+)/gi)]
    .map((match) => match[1])
    .filter((id) => id !== currentId);
  return [...new Set(ids)].slice(0, 5);
}

export function parseListingHowToApply(html: string) {
  const section = html.match(/How to Apply[\s\S]{0,4000}/i)?.[0]
    ?? html.match(/Application Process[\s\S]{0,4000}/i)?.[0]
    ?? "";
  return section.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 800);
}

export async function fetchListingPage(
  opportunityId: string,
  options: {
    fetcher?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<{ html: string; sourceUrl: string } | null> {
  const sourceUrl = grantsListingPageUrl(opportunityId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 4_000);
  try {
    const response = await (options.fetcher ?? fetch)(sourceUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "text/html" },
    });
    if (!response.ok) return null;
    const html = await response.text();
    return html.trim() ? { html, sourceUrl } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
