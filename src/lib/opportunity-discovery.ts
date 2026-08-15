import { normalizeConcepts } from "./concept-normalization";
import {
  createRecommendationIntelligence,
  type RecommendationIntelligence,
} from "./opportunity-intelligence";
import type {
  CompanyProfile,
  MatchResult,
  Opportunity,
} from "./opportunity-types";
import type {
  CurrentOpportunityRecord,
  HistoricalAwardRecord,
  ProgramContextRecord,
  SourcedGovernmentRecord,
} from "./sources/source-contracts";

export interface DiscoveryRecommendation {
  opportunity: Opportunity;
  match: MatchResult;
  intelligence: RecommendationIntelligence;
}

export interface DiscoveryResultMeta {
  qualifyingCount: number;
  returnedCount: number;
  defaultVisible: 5;
  resultCap: 20;
  truncated: boolean;
}

export interface OpportunityDiscovery {
  recommendations: readonly DiscoveryRecommendation[];
  programs: readonly ProgramContextRecord[];
  historicalAwards: readonly HistoricalAwardRecord[];
  resultMeta: DiscoveryResultMeta;
}

export type OpportunityRanker = (
  company: CompanyProfile,
  opportunities: readonly Opportunity[],
) => MatchResult[];

function opportunityStatus(status: string): Opportunity["opportunityStatus"] | null {
  const normalized = status.trim().toLocaleLowerCase("en-US");
  if (normalized.includes("forecast")) return "forecast";
  if (normalized === "posted" || normalized === "open") return "open";
  return null;
}

const APPLICANT_CATEGORY_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["small business", /\bsmall businesses?\b/i],
  ["for-profit", /\bfor[- ]profit (?:organizations?|entities?)\b/i],
  ["nonprofit", /\bnon[- ]?profits?\b/i],
  ["institution of higher education", /institutions? of higher education|institutes? of higher education|\buniversit(?:y|ies)\b|\bcolleges?\b/i],
  ["state government", /\bstate governments?\b|\bstates(?=\s*[,;])/i],
  ["county government", /\bcounty governments?\b|\bcounties\b/i],
  ["local government", /city or township governments?|\blocal authorities\b|\bmunicipalit(?:y|ies)\b/i],
  ["special district government", /special district governments?|irrigation districts?|water districts?|wastewater districts?/i],
  ["tribal government", /native american tribal governments?|\btribal governments?\b|\btribes\b/i],
  ["tribal organization", /native american tribal organizations?|\btribal organizations?\b/i],
  ["independent school district", /independent school districts?/i],
  ["public housing authority", /public housing authorities|indian housing authorities/i],
  ["individual", /\bindividuals?\b/i],
  ["foreign organization", /\bforeign (?:organizations?|entities?)\b/i],
];

const US_GEOGRAPHIES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming", "American Samoa", "Guam",
  "Northern Mariana Islands", "Puerto Rico", "Virgin Islands",
] as const;

function categoriesIn(value: string) {
  return APPLICANT_CATEGORY_PATTERNS.flatMap(
    ([category, pattern]) => pattern.test(value) ? [category] : [],
  );
}

function eligibilitySections(record: CurrentOpportunityRecord) {
  const raw = (record.additionalEligibility ?? "").trim();
  const affirmative = raw.match(
    /\beligible applicants?\b|\bapplicants? (?:are )?eligible\b|\beligible entities\b|\beligibility is limited to\b/i,
  );
  if (!affirmative || affirmative.index === undefined) {
    return { positive: "", negative: "" };
  }
  const candidate = raw.slice(affirmative.index);
  const negativePattern = /\bineligible\b|\bnot eligible\b|\bnon[- ]eligible\b|\bthose not eligible\b|\bexcept(?: for)?\b|\bexcluding\b|\bmay not apply\b|\bcannot apply\b|\bmust not apply\b|\bnot permitted(?: to apply)?\b|\bprohibited from applying\b|\bbarred from applying\b/i;
  const negative = candidate.match(negativePattern);
  if (!negative || negative.index === undefined) {
    return { positive: candidate.trim(), negative: "" };
  }
  let splitIndex = negative.index;
  if (/not eligible|may not apply|cannot apply|must not apply|not permitted|prohibited|barred|except|excluding/i.test(negative[0])) {
    const prefix = candidate.slice(0, negative.index);
    const sentenceBoundary = Math.max(
      prefix.lastIndexOf("."),
      prefix.lastIndexOf(";"),
      prefix.lastIndexOf("\n"),
    );
    splitIndex = sentenceBoundary >= 0 ? sentenceBoundary + 1 : 0;
  }
  return {
    positive: candidate.slice(0, splitIndex).trim(),
    negative: candidate.slice(splitIndex).trim(),
  };
}

function structuredApplicantFacts(record: CurrentOpportunityRecord) {
  const categories = new Set<string>();
  const excluded = new Set<string>();
  let unrestricted = false;
  let explicitlyAllowsSmallBusiness = false;
  for (const description of record.eligibleApplicantTypes ?? []) {
    if (/\bunrestricted\b|open to all applicant types/i.test(description)) {
      unrestricted = true;
      continue;
    }
    if (/others?.*additional information/i.test(description)) continue;
    if (/for[- ]profit organizations? other than small businesses/i.test(description)) {
      categories.add("for-profit");
      excluded.add("small business");
      continue;
    }
    for (const category of categoriesIn(description)) categories.add(category);
    if (/^\s*small businesses?\s*$/i.test(description)) {
      explicitlyAllowsSmallBusiness = true;
    }
  }
  if (explicitlyAllowsSmallBusiness) excluded.delete("small business");
  return { categories, excluded, unrestricted };
}

function applicantRoute(record: CurrentOpportunityRecord) {
  const structured = structuredApplicantFacts(record);
  const sections = eligibilitySections(record);
  const categories = new Set([
    ...structured.categories,
    ...categoriesIn(sections.positive),
  ]);
  const excluded = new Set([
    ...structured.excluded,
    ...categoriesIn(sections.negative),
  ]);
  const ambiguousCategories = [...categories].filter((category) => excluded.has(category));
  const unrestricted = structured.unrestricted
    || /\bunrestricted\b|open to all applicant types/i.test(sections.positive);
  const normalizedCategories = ambiguousCategories.length
    ? []
    : [...categories];
  const known = record.detailStatus === "enriched"
    && ambiguousCategories.length === 0
    && (unrestricted || normalizedCategories.length > 0);
  const directStartupRoute = unrestricted
    || normalizedCategories.includes("small business")
    || normalizedCategories.includes("for-profit");
  const partnerable = normalizedCategories.some((category) => [
    "nonprofit",
    "institution of higher education",
    "state government",
    "county government",
    "local government",
    "special district government",
    "tribal government",
    "tribal organization",
    "independent school district",
    "public housing authority",
  ].includes(category));
  return {
    categories: unrestricted ? [] : normalizedCategories,
    excludedCategories: ambiguousCategories.length ? [] : [...excluded],
    known,
    partnerRequired: known && !directStartupRoute && partnerable,
    eligibilityText: sections.positive,
  };
}

function allowedGeographies(eligibilityText: string) {
  return US_GEOGRAPHIES.filter((name) => new RegExp(
    `\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "i",
  ).test(eligibilityText));
}

function noticeAmount(record: CurrentOpportunityRecord): Opportunity["amount"] {
  if (record.awardFloor === undefined && record.awardCeiling === undefined) return undefined;
  return {
    ...(record.awardFloor !== undefined ? { min: record.awardFloor } : {}),
    ...(record.awardCeiling !== undefined ? { max: record.awardCeiling } : {}),
    currency: "USD",
  };
}

function toOpportunity(record: CurrentOpportunityRecord): Opportunity | null {
  const status = opportunityStatus(record.status);
  if (!status) return null;
  const concepts = normalizeConcepts(`${record.title} ${record.description}`);
  const titleConcepts = normalizeConcepts(record.title);
  const route = applicantRoute(record);
  const requirementText = `${record.additionalEligibility ?? ""} ${record.description}`;
  return {
    id: record.id,
    title: record.title,
    opportunityNumber: record.opportunityNumber,
    recordKind: "opportunity",
    source: record.source,
    agency: record.agency,
    opportunityStatus: status,
    deadline: record.deadline || undefined,
    amount: noticeAmount(record),
    assistanceListings: record.assistanceListings,
    costShare: record.costSharing,
    applicationRoute: record.applicationRoute,
    fundingInstruments: record.fundingInstruments,
    eligibilitySummary: record.additionalEligibility || undefined,
    noticeDetailStatus: record.detailStatus ?? "not-requested",
    scopeSummary: record.description ? record.description.slice(0, 1_200) : undefined,
    titleConcepts,
    ...concepts,
    geographies: allowedGeographies(route.eligibilityText),
    eligibility: {
      ...(route.categories.length ? { applicantTypes: route.categories } : {}),
      ...(route.excludedCategories.length
        ? { excludedApplicantTypes: route.excludedCategories }
        : {}),
      ...(/sam\.gov|system for award management/i.test(requirementText)
        ? { samRegistration: true }
        : {}),
      ...(/unique entity identifier|\buei\b/i.test(requirementText)
        ? { uei: true }
        : {}),
      ...(/\bdomestic (?:entities|organizations)\b|incorporated in the united states|foreign entities? (?:are )?not eligible/i.test(requirementText)
        ? { usEntity: true }
        : {}),
      ...(route.partnerRequired
        ? { partnerMaySatisfy: ["applicantType" as const] }
        : {}),
      ...(!route.known
        ? { unverifiedCriticalFields: ["exact notice applicant type"] }
        : {}),
    },
  };
}

function deduplicate<TRecord extends SourcedGovernmentRecord>(
  records: readonly TRecord[],
): TRecord[] {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

export function selectOpportunityCandidates(
  company: CompanyProfile,
  records: readonly CurrentOpportunityRecord[],
  ranker: OpportunityRanker,
  limit = 24,
): CurrentOpportunityRecord[] {
  const uniqueRecords = deduplicate(records);
  const opportunityById = new Map(uniqueRecords.flatMap((record) => {
    const opportunity = toOpportunity(record);
    return opportunity ? [[opportunity.id, opportunity] as const] : [];
  }));
  const recordById = new Map(uniqueRecords.map((record) => [record.id, record]));
  return ranker(company, [...opportunityById.values()])
    .filter((match) => match.decision !== "Skip" && match.score.total >= 35)
    .slice(0, limit)
    .flatMap((match) => {
      const record = recordById.get(match.opportunityId);
      return record ? [record] : [];
    });
}

export function discoverOpportunities(
  company: CompanyProfile,
  records: readonly SourcedGovernmentRecord[],
  ranker: OpportunityRanker,
): OpportunityDiscovery {
  const currentRecords = deduplicate(
    records.filter((record): record is CurrentOpportunityRecord => record.kind === "current_opportunity"),
  );
  const opportunities = currentRecords
    .map(toOpportunity)
    .filter((record): record is Opportunity => Boolean(record));
  const opportunityById = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const historicalAwards = deduplicate(
    records.filter((record): record is HistoricalAwardRecord => record.kind === "historical_award"),
  );
  const qualifyingMatches = ranker(company, opportunities)
    .filter((match) => match.decision !== "Skip" && match.score.total >= 35);
  const recommendations = qualifyingMatches
    .slice(0, 20)
    .flatMap((match): DiscoveryRecommendation[] => {
      const opportunity = opportunityById.get(match.opportunityId);
      return opportunity ? [{
        opportunity,
        match,
        intelligence: createRecommendationIntelligence(
          company,
          opportunity,
          match,
          historicalAwards,
        ),
      }] : [];
    });

  return {
    recommendations,
    programs: deduplicate(
      records.filter((record): record is ProgramContextRecord => record.kind === "program_context"),
    ),
    historicalAwards,
    resultMeta: {
      qualifyingCount: qualifyingMatches.length,
      returnedCount: recommendations.length,
      defaultVisible: 5,
      resultCap: 20,
      truncated: qualifyingMatches.length > 20,
    },
  };
}
