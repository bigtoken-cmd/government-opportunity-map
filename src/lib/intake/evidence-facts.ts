const MONEY_PATTERN =
  /\$\s*\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:\s*(?:[kKmMbB]|thousand|million|billion)\b)?|\b\d+(?:\.\d+)?\s*(?:thousand|million|billion|[kKmMbB])\b/g;
const MAGNITUDE_PATTERN =
  /\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s*(k|m|b|thousand|million|billion)?\b/gi;

const RAISED_CUE =
  /\b(?:pre[-\s]?seed|seed round|series\s+[a-g]\b|raised|closed(?:\s+a)?|financing to date|capital raised|funding to date|round size)\b/i;
const NEED_CUE =
  /\b(?:seeking|looking to raise|funding need|capital need|this raise|asking for|raise of)\b/i;
const REVENUE_CUE =
  /\b(?:revenue|arr\b|annual recurring|last year(?:'s)? (?:sales|revenue))\b/i;

export interface EvidenceFinancialFacts {
  capitalRaised: string;
  capitalNeed: string;
  revenue: string;
}

function magnitudeMultiplier(suffix: string) {
  switch (suffix.toLocaleLowerCase("en-US")) {
    case "b":
    case "billion":
      return 1_000_000_000;
    case "m":
    case "million":
      return 1_000_000;
    case "k":
    case "thousand":
      return 1_000;
    default:
      return 1;
  }
}

export function scaledMoneyAmounts(text: string) {
  const amounts = new Set<number>();
  for (const match of text.matchAll(MAGNITUDE_PATTERN)) {
    const suffix = match[3] ?? "";
    const hasMoneyMarker = /\$/.test(match[0]) || suffix.length > 0;
    if (!hasMoneyMarker) continue;
    const whole = Number(match[1].replaceAll(",", ""));
    if (!Number.isFinite(whole)) continue;
    const fraction = match[2] ? Number(`0.${match[2]}`) : 0;
    amounts.add((whole + fraction) * magnitudeMultiplier(suffix));
  }
  return amounts;
}

export function excerptSupportsMappedAmount(excerpt: string, value: string) {
  const excerptAmounts = scaledMoneyAmounts(excerpt);
  const valueAmounts = scaledMoneyAmounts(value);
  for (const amount of valueAmounts) {
    if (excerptAmounts.has(amount)) return true;
  }
  return false;
}

function moneyNearCue(text: string, cue: RegExp) {
  for (const match of text.matchAll(MONEY_PATTERN)) {
    const start = Math.max(0, (match.index ?? 0) - 96);
    const before = text.slice(start, match.index ?? 0);
    if (cue.test(before)) return match[0].replace(/\s+/g, " ").trim();
  }
  return "";
}

export function extractFinancialFacts(text: string): EvidenceFinancialFacts {
  const capitalRaised = moneyNearCue(text, RAISED_CUE);
  const capitalNeed = moneyNearCue(text, NEED_CUE);
  const revenue = moneyNearCue(text, REVENUE_CUE);
  return {
    capitalRaised,
    capitalNeed: capitalNeed && capitalNeed !== capitalRaised ? capitalNeed : "",
    revenue: revenue && revenue !== capitalRaised && revenue !== capitalNeed ? revenue : "",
  };
}
