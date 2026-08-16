"use client";

import {
  ChangeEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { ThinkingOrb } from "thinking-orbs";
import { pickSupportedEvidenceProfile } from "@/lib/intake/evidence-profile";
import {
  type FounderProfileInput,
} from "@/lib/intake/profile-normalization";
import type { DiscoveryRecommendation } from "@/lib/opportunity-discovery";
import type {
  GovernmentSourceSearchResult,
  SourceSearchSummary,
} from "@/lib/opportunity-search";
import {
  WorkspaceClientError,
  createWorkspaceClient,
  type WorkspaceClientCredentials,
} from "@/lib/persistence/workspace-client";
import type {
  HistoricalAwardRecord,
  ProgramContextRecord,
} from "@/lib/sources/source-contracts";
import {
  hydrateWorkspace,
  setChecklistItem,
  type WorkspaceState,
} from "@/lib/workspace-state";
import { ProgressRail, TaskRows } from "./product-primitives";
import ResourceDashboard from "./resource-dashboard";

type Stage = "intake" | "review" | "results" | "workspace";
type FitTier = "Likely Fit" | "Potential Fit" | "Adjacent";
type Decision = "Pursue now" | "Verify first" | "Partner-dependent" | "Watch" | "Skip";
type SaveMode = "saving" | "device-only" | "durable";
type ReviewMode = "required" | "optional" | "confirm" | "save";

type ProfileFieldOrigin = {
  origin: "extracted" | "normalized" | "unknown" | "founder-confirmed" | "inferred" | "summarized";
  sourceId?: string;
  sourceIds?: readonly string[];
  sourceTextOrigin?: string;
  sourceTextOrigins?: readonly string[];
  originalValue?: string;
};

type ProfileFieldOrigins = Partial<Record<keyof CompanyProfile, ProfileFieldOrigin>>;

type SearchProfile = Required<Omit<FounderProfileInput, "id">>;

export type CompanyProfile = SearchProfile & {
  founderName: string;
  founderRole: string;
  founderEmail: string;
};

type OpportunityCard = {
  id: string;
  title: string;
  agency: string;
  opportunityNumber: string;
  sourceKind: "Current opportunity" | "Forecasted opportunity" | "Program route";
  sourceLabel: string;
  sourceUrl: string;
  retrievedAt: string;
  deadline: string;
  amount: string;
  fitTier: FitTier;
  decision: Decision;
  relationship: string;
  reasons: string[];
  concerns: string[];
  nextAction: string;
  historicalEvidence: string[];
  historicalLimitation: string;
  similarOpportunities: Array<{
    id: string;
    title: string;
    agency: string;
    sourceUrl: string;
    opportunityNumber: string;
  }>;
  applicationFields: Array<{
    label: string;
    profileKey?: keyof CompanyProfile;
    note?: string;
    value?: string;
  }>;
};

export type RankedOpportunityCard = OpportunityCard & {
  score: number;
  eligibilityChecks: string[];
};

type WebsiteResponse = {
  profile?: unknown;
  evidence?: Array<{
    field: string;
    value: string;
    sourceUrl: string;
    sourceId?: string;
    evidenceExcerpt?: string;
  }>;
  retrievedAt?: string;
  warning?: string;
  error?: string;
  fallback?: string;
  externalProcessing?: {
    attempted: boolean;
    completed: boolean;
    reason: string | null;
  };
  externalProcessingDisclosure?: string;
};

type EvidenceResponse = WebsiteResponse;

type EvidenceBundleResponse = EvidenceResponse & {
  profileFieldOrigins?: Record<string, ProfileFieldOrigin>;
  sources?: Array<{
    id: string;
    displayName: string;
    extractionStatus: string;
    message?: string;
  }>;
  warnings?: string[];
};

type SourceHealth = {
  status: "idle" | "checking" | "live" | "cached" | "cached-fallback" | "unavailable";
  message: string;
};

type ExternalSourcePrompt = {
  url: string;
  title: string;
  context: string;
};

type UploadedFile = {
  name: string;
  size: number;
  kind: "pdf" | "docx" | "pptx";
  file: File;
};

type ProfileFieldDefinition = {
  key: keyof CompanyProfile;
  label: string;
  question: string;
  why: string;
  placeholder: string;
  type?: "text" | "email" | "url";
  autoComplete?: string;
  multiline?: boolean;
  options?: readonly string[];
  multipleOptions?: boolean;
  optionDisplay?: "checklist" | "dropdown";
  optionLayout?: "row-first" | "column-first";
};

const REQUIRED_PROFILE_QUESTIONS: ProfileFieldDefinition[] = [
  { key: "description", label: "Company description", question: "What does the company offer?", why: "A short description of the product and problem gives us the strongest starting point.", placeholder: "Briefly describe the product or service and the problem it solves.", multiline: true },
  { key: "industry", label: "Industry", question: "Which industry best describes your business?", why: "Choose the closest match. Select Other if your industry is not listed.", placeholder: "Select an industry", options: ["Agriculture and food", "Aerospace and defense", "Automotive and mobility", "Biotechnology and life sciences", "Climate and clean energy", "Construction and real estate", "Consumer products and retail", "Cybersecurity", "Education", "Energy and utilities", "Financial services", "Government and civic technology", "Healthcare and medical devices", "Industrial and advanced manufacturing", "Information technology and software", "Logistics and supply chain", "Media and entertainment", "Mining and natural resources", "Professional and business services", "Robotics and automation", "Semiconductors and electronics", "Telecommunications", "Transportation and infrastructure", "Water and environmental services", "Other"], optionDisplay: "dropdown" },
  { key: "technology", label: "Core technology or method", question: "What is the main technology or method behind what you offer?", why: "Think about the software, equipment, scientific method, or technical process that makes it work.", placeholder: "e.g., computer vision, membrane filtration, industrial robotics, or a specialized service method" },
  { key: "location", label: "Company location", question: "Where is the company based?", why: "Some routes have state, domestic, or place-of-performance rules.", placeholder: "City, state, and country", autoComplete: "address-level2" },
  { key: "applicantType", label: "Organization type", question: "What type of organization are you?", why: "Government programs often limit which types of organizations can apply.", placeholder: "Select an organization type", options: ["For-profit business", "Nonprofit organization", "University or research institution", "State government", "Local government", "Tribal government or organization", "Individual", "Other organization"] },
  { key: "ownership", label: "Ownership and control", question: "How is the company owned and controlled?", why: "Select all that apply. Some small-business and research programs have ownership requirements.", placeholder: "Select ownership details", options: ["Founder-owned", "U.S. citizen or permanent-resident owned and controlled", "Woman-owned", "Minority-owned", "Veteran-owned", "Venture-backed or institutionally owned", "Subsidiary or parent-owned", "Not sure"], multipleOptions: true },
  { key: "useOfFunds", label: "Use of funds", question: "What will the funds be used for?", why: "A practical use of funds helps us find programs that support the work you actually want to do.", placeholder: "e.g., research, prototyping, pilot testing, equipment, or commercialization", multiline: true },
];

const OPTIONAL_PROFILE_FIELDS: ProfileFieldDefinition[] = [
  { key: "companyName", label: "Company name", question: "Company name", why: "", placeholder: "Company name", autoComplete: "organization" },
  { key: "website", label: "Website", question: "Company website", why: "", placeholder: "https://yourcompany.com", type: "url", autoComplete: "url" },
  { key: "yearFounded", label: "Year founded", question: "Year founded", why: "", placeholder: "2021" },
  { key: "employees", label: "Team size", question: "Team size", why: "", placeholder: "Select a team size", options: ["1–2 people", "3–10 people", "11–50 people", "51–250 people", "251 or more people"] },
  { key: "customers", label: "Target customers", question: "Who is the product for?", why: "", placeholder: "e.g., consumers, small businesses, hospitals, or public agencies", multiline: true },
  { key: "productStage", label: "Product stage", question: "Product stage", why: "", placeholder: "Select a product stage", options: ["Concept", "Prototype", "Pilot", "Commercial product"] },
  { key: "researchStage", label: "Research stage", question: "Research stage", why: "", placeholder: "Select a research stage", options: ["No formal R&D", "Early research", "Feasibility", "Prototype development", "Validation or field testing"] },
  { key: "capitalNeed", label: "Funding need", question: "Preferred funding range", why: "", placeholder: "e.g., $100,000–$500,000" },
  { key: "revenue", label: "Annual revenue", question: "Annual revenue", why: "", placeholder: "$750,000 last year" },
  { key: "capitalRaised", label: "Capital raised", question: "Capital raised so far", why: "", placeholder: "$1.2 million raised to date" },
  { key: "legalEntityType", label: "Legal structure", question: "Legal structure", why: "", placeholder: "Select a legal structure", options: ["Sole proprietorship", "Limited liability company (LLC)", "Corporation", "Partnership", "Nonprofit corporation", "Other"] },
  { key: "smallBusinessStatus", label: "Small-business status", question: "Do you consider the organization a small business?", why: "", placeholder: "Select a status", options: ["Yes", "No", "Not sure"] },
  { key: "usEntityStatus", label: "U.S. entity status", question: "Is the organization formed in the United States?", why: "", placeholder: "Select a status", options: ["Yes", "No", "Not sure"] },
  { key: "samStatus", label: "SAM.gov status", question: "SAM.gov registration status", why: "", placeholder: "Select a registration status", options: ["Active", "In progress", "Expired", "Not started", "Unsure"], optionLayout: "column-first" },
  { key: "uei", label: "Unique Entity ID (from SAM.gov)", question: "Unique Entity ID (from SAM.gov)", why: "", placeholder: "12-character identifier assigned through SAM.gov" },
];

const SAVE_PROFILE_FIELDS: ProfileFieldDefinition[] = [
  { key: "founderName", label: "Primary contact", question: "Primary contact name", why: "", placeholder: "Full name", autoComplete: "name" },
  { key: "founderRole", label: "Contact role", question: "Primary contact role", why: "", placeholder: "Job title", autoComplete: "organization-title" },
  { key: "founderEmail", label: "Contact email", question: "Primary contact email", why: "", placeholder: "name@company.com", type: "email", autoComplete: "email" },
];

const OPTIONAL_PROFILE_GROUPS: Array<{
  title: string;
  description: string;
  keys: Array<keyof CompanyProfile>;
}> = [
  {
    title: "Company details",
    description: "Helpful context about the business and who it serves.",
    keys: ["companyName", "website", "yearFounded", "employees", "customers", "productStage", "researchStage"],
  },
  {
    title: "Funding details",
    description: "Optional financial context for narrowing the range of possible programs.",
    keys: ["capitalNeed", "revenue", "capitalRaised"],
  },
  {
    title: "Eligibility and federal registration",
    description: "Organization and registration details used to verify application requirements.",
    keys: ["legalEntityType", "smallBusinessStatus", "usEntityStatus", "samStatus", "uei"],
  },
];

const PROFILE_REVIEW_ONLY_FIELDS: ProfileFieldDefinition[] = [
  { key: "researchActivities", label: "Research and development", question: "Technical milestones", why: "", placeholder: "e.g., prototyping, validation, field trials, or certification", multiline: true },
];

const PROFILE_FIELD_DEFINITIONS = [
  ...REQUIRED_PROFILE_QUESTIONS,
  ...OPTIONAL_PROFILE_FIELDS,
  ...SAVE_PROFILE_FIELDS,
  ...PROFILE_REVIEW_ONLY_FIELDS,
];

const PROFILE_REVIEW_GROUPS: Array<{
  title: string;
  description: string;
  keys: Array<keyof CompanyProfile>;
}> = [
  {
    title: "Company details",
    description: "The core facts used to understand the business and its work.",
    keys: ["companyName", "website", "description", "industry", "technology", "location", "yearFounded", "employees", "customers", "productStage", "researchStage", "researchActivities"],
  },
  {
    title: "Financing",
    description: "The project and financial context used to narrow possible funding routes.",
    keys: ["capitalNeed", "useOfFunds", "revenue", "capitalRaised"],
  },
  {
    title: "Eligibility and federal registration",
    description: "Organization and registration details used to check applicant requirements.",
    keys: ["applicantType", "legalEntityType", "ownership", "smallBusinessStatus", "usEntityStatus", "samStatus", "uei"],
  },
];

const REQUIRED_PROFILE_FIELD_KEYS = new Set(
  REQUIRED_PROFILE_QUESTIONS.map(({ key }) => key),
);

const EXTERNAL_SOURCE_CHECKS = [
  {
    label: "Application route",
    prompt: "Is this a direct application or a partner-dependent pathway?",
  },
  {
    label: "Record status",
    prompt: "Is the notice current, forecasted, expired, or archived?",
  },
  {
    label: "Eligibility subject",
    prompt: "Does eligibility apply to the company, a principal investigator, or a consortium?",
  },
  {
    label: "Geography",
    prompt: "Are there domestic, state, manufacturing-location, or international restrictions?",
  },
  {
    label: "Goal fit",
    prompt: "Does this route still match the founder’s actual project and goal?",
  },
] as const;

const EMPTY_PROFILE: CompanyProfile = {
  companyName: "",
  founderName: "",
  founderRole: "",
  founderEmail: "",
  website: "",
  description: "",
  industry: "",
  technology: "",
  location: "",
  yearFounded: "",
  employees: "",
  revenue: "",
  capitalRaised: "",
  capitalNeed: "",
  useOfFunds: "",
  customers: "",
  researchActivities: "",
  applicantType: "",
  legalEntityType: "",
  ownership: "",
  productStage: "",
  researchStage: "",
  smallBusinessStatus: "",
  usEntityStatus: "",
  samStatus: "",
  uei: "",
};

const COMMON_APPLICATION_FIELDS: OpportunityCard["applicationFields"] = [
  { label: "Primary contact name", profileKey: "founderName" },
  { label: "Primary contact role", profileKey: "founderRole" },
  { label: "Primary contact email", profileKey: "founderEmail" },
  { label: "Legal organization name", profileKey: "companyName" },
  { label: "Organization website", profileKey: "website" },
  { label: "Project summary", profileKey: "description" },
  { label: "Principal place of business", profileKey: "location" },
  { label: "Requested amount", profileKey: "capitalNeed" },
  { label: "Proposed use of funds", profileKey: "useOfFunds" },
  { label: "Applicant type", profileKey: "applicantType" },
  { label: "SAM.gov registration", profileKey: "samStatus" },
  { label: "Unique Entity ID", profileKey: "uei" },
];

function displayDate(value: string) {
  if (!value) return "Verify on official notice";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function displayAmount(
  amount: DiscoveryRecommendation["opportunity"]["amount"],
) {
  if (!amount) return "Verify on official notice";
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: amount.currency,
    maximumFractionDigits: 0,
  });
  if (amount.min !== undefined && amount.max !== undefined) {
    return `${formatter.format(amount.min)}–${formatter.format(amount.max)}`;
  }
  if (amount.max !== undefined) return `Up to ${formatter.format(amount.max)}`;
  if (amount.min !== undefined) return `From ${formatter.format(amount.min)}`;
  return "Verify on official notice";
}

function isSupportedProfileValue(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return false;
  const unsupportedExactValues = new Set([
    "unknown",
    "n/a",
    "na",
    "tbd",
    "pending",
    "not provided",
    "not available",
    "to be determined",
  ]);
  return !unsupportedExactValues.has(normalized)
    && !normalized.startsWith("unknown ")
    && !normalized.includes("founder input needed")
    && !normalized.includes("leave blank");
}

function isSupportedProfileField(key: keyof CompanyProfile | undefined, value: unknown) {
  if (!isSupportedProfileValue(value)) return false;
  if (key !== "founderEmail") return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

function profileForDisplay(candidate: Partial<CompanyProfile>): CompanyProfile {
  const profile = { ...EMPTY_PROFILE, ...candidate };
  return Object.fromEntries(
    (Object.keys(EMPTY_PROFILE) as Array<keyof CompanyProfile>).map((key) => [
      key,
      isSupportedProfileValue(profile[key]) ? String(profile[key]).trim() : "",
    ]),
  ) as CompanyProfile;
}

function sourceSummaryMessage(summary: SourceSearchSummary) {
  if (summary.warning) return summary.warning;
  if (summary.family === "grants") {
    return `${summary.recordCount} validated Grants.gov record${summary.recordCount === 1 ? "" : "s"} normalized for matching.`;
  }
  if (summary.family === "usaspending") {
    return `${summary.recordCount} historical USAspending record${summary.recordCount === 1 ? "" : "s"} kept separate from recommendations.`;
  }
  return `${summary.recordCount} ${summary.name} record${summary.recordCount === 1 ? "" : "s"} checked.`;
}

function mapDiscoveryRecommendation(
  recommendation: DiscoveryRecommendation,
): RankedOpportunityCard {
  const { opportunity, match, intelligence } = recommendation;
  const eligibilityChecks = intelligence.concerns.map((concern) => concern.text);
  const reasons = intelligence.whyFit.map(({ companyFact, opportunityFact }) =>
    `${companyFact.replace(/\.$/, "")} — ${opportunityFact.replace(/\.$/, "").replace(/^The /, "the ")}.`);
  const historicalEvidence = (intelligence.historicalSupport?.awards ?? []).map((award) => {
    const amount = typeof award.amount === "number"
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(award.amount)
      : "amount not stated";
    return `${award.recipient} received ${amount} for ${award.title}.`;
  });
  return {
    id: opportunity.id,
    title: opportunity.title,
    agency: opportunity.agency,
    opportunityNumber: opportunity.opportunityNumber ?? opportunity.source.sourceId,
    sourceKind: opportunity.opportunityStatus === "forecast"
      ? "Forecasted opportunity"
      : "Current opportunity",
    sourceLabel: opportunity.source.snapshotStatus === "live"
      ? opportunity.source.sourceName
      : `${opportunity.source.sourceName} · audited official fallback`,
    sourceUrl: opportunity.source.sourceUrl,
    retrievedAt: displayDate(opportunity.source.retrievedAt),
    deadline: displayDate(opportunity.deadline ?? ""),
    amount: displayAmount(opportunity.amount),
    fitTier: match.fitStatus === "Strong Fit" ? "Likely Fit" : "Potential Fit",
    decision: match.decision,
    relationship: intelligence.decisionSummary,
    reasons: reasons.length ? reasons : [intelligence.decisionSummary],
    concerns: eligibilityChecks,
    nextAction: intelligence.nextAction.text,
    historicalEvidence,
    historicalLimitation: intelligence.historicalSupport?.limitation ?? "No opportunity-specific historical award was returned by this bounded search.",
    similarOpportunities: (recommendation.similarOpportunities ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      agency: item.agency,
      sourceUrl: item.sourceUrl,
      opportunityNumber: item.opportunityNumber,
    })),
    applicationFields: recommendation.listingPrefillFields?.length
      ? recommendation.listingPrefillFields.map((field) => ({
        label: field.label,
        note: field.note,
        value: field.value,
        ...(field.profileKey && field.profileKey in EMPTY_PROFILE
          ? { profileKey: field.profileKey as keyof CompanyProfile }
          : {}),
      }))
      : COMMON_APPLICATION_FIELDS,
    score: match.effectiveScore ?? match.score.total,
    eligibilityChecks,
  };
}

const INITIAL_CHECKLIST = [
  { id: "registrations", label: "Confirm SAM.gov registration and UEI", detail: "Required before many federal submissions." },
  { id: "eligibility", label: "Verify every applicant-type requirement", detail: "Check ownership, location, size, and research-employment rules." },
  { id: "notice", label: "Select the exact current funding notice", detail: "A program family is not the same as an open opportunity." },
  { id: "scope", label: "Write the technical problem and R&D scope", detail: "Separate research risk from normal product work or expansion." },
  { id: "budget", label: "Build an evidence-backed budget", detail: "Use only costs allowed by the selected notice." },
  { id: "package", label: "Review the official application package", detail: "Leave unsupported answers blank until the founder supplies them." },
];

const STORAGE_KEY = "government-opportunity-map-workspace-v1";
const STORAGE_VERSION = 3;
const WORKSPACE_CLIENT = createWorkspaceClient();
const SAVE_MODE_CONTENT: Record<
  SaveMode,
  { announcement: string; label: string; saved: boolean }
> = {
  saving: {
    announcement: "Saving progress",
    label: "Saving progress…",
    saved: false,
  },
  "device-only": {
    announcement: "Progress saved",
    label: "Progress saved",
    saved: true,
  },
  durable: {
    announcement: "Progress saved",
    label: "Progress saved",
    saved: true,
  },
};
interface StoredWorkbenchSnapshot {
  version?: number;
  discoveryOrigin?: "api";
  stage?: Stage;
  profile?: CompanyProfile;
  profileFieldOrigins?: ProfileFieldOrigins;
  selectedOpportunityId?: string;
  workspace?: WorkspaceState;
  sourceEvidence?: string[];
  matches?: RankedOpportunityCard[];
  programs?: ProgramContextRecord[];
  historicalAwards?: HistoricalAwardRecord[];
  sourceSummaries?: SourceSearchSummary[];
  searchError?: string;
  durableWorkspace?: WorkspaceClientCredentials;
  savedOpportunityIds?: string[];
}

function normalizedProfileOrigins(
  result: EvidenceBundleResponse,
  profile: CompanyProfile,
  manualProfile: CompanyProfile | null,
  websiteProvided: boolean,
): ProfileFieldOrigins {
  const raw = result.profileFieldOrigins ?? {};
  const origins: ProfileFieldOrigins = {};
  for (const key of Object.keys(profile) as Array<keyof CompanyProfile>) {
    const returned = raw[key];
    if (returned?.origin === "extracted" || returned?.origin === "normalized"
      || returned?.origin === "inferred" || returned?.origin === "summarized") {
      origins[key] = returned;
    } else if (manualProfile && isSupportedProfileValue(manualProfile[key])) {
      origins[key] = { origin: "extracted", sourceId: "manual", sourceTextOrigin: "user-supplied" };
    } else if (key === "website" && websiteProvided && isSupportedProfileValue(profile.website)) {
      origins[key] = { origin: "founder-confirmed" };
    } else {
      origins[key] = returned ?? { origin: "unknown" };
    }
  }
  return origins;
}

function intakeResultMessage(result: EvidenceResponse) {
  if (result.externalProcessing?.completed) {
    return result.warning
      ?? "OpenAI suggestions were extracted from the supplied evidence. Confirm every field before matching.";
  }
  const reason = result.externalProcessing?.reason;
  const suffix = reason ? ` Status: ${reason.replaceAll("_", " ")}.` : "";
  return `${result.warning ?? "Continue with the editable evidence-only profile."}${suffix}`;
}

function clearStoredDurableCredentials() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const parsed = JSON.parse(stored) as StoredWorkbenchSnapshot;
    delete parsed.durableWorkspace;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

function StepRail({ stage }: { stage: Stage }) {
  if (stage === "results" || stage === "workspace") return null;
  const step = stage === "intake" ? 1 : 2;
  const label = stage === "intake" ? "Add your information" : "Complete your profile";
  return (
    <div className="flex items-center gap-3 text-sm font-semibold text-[#68778b]" aria-label="Profile progress">
      <span>Step {step} of 2</span>
      <span aria-hidden="true" className="h-px w-8 bg-[#d7e0ed]" />
      <span className="text-[#06275c]">{label}</span>
    </div>
  );
}

function AppHeader({
  onReset,
  saveMode,
}: {
  onReset: () => void;
  saveMode: SaveMode;
}) {
  const saveContent = SAVE_MODE_CONTENT[saveMode];
  return (
    <header className="app-header sticky top-0 z-30 border-b border-[#0a1930]/10 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-8 lg:px-12">
        <p className="app-brand min-w-0 truncate">Government Resource Finder</p>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span aria-live="polite" className="sr-only">{saveContent.announcement}</span>
          <span aria-hidden="true" className="hidden items-center gap-1 text-xs text-[#68778b] sm:flex" title={saveContent.announcement}>
            {saveContent.saved ? (
              <svg
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 text-current"
              >
                <path
                  d="m3 8 3 3 7-7"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            )}
            {saveContent.label}
          </span>
          <button
            type="button"
            onClick={onReset}
            className="min-h-10 rounded-full border border-[#0a1930]/12 bg-white px-3.5 py-2 text-xs font-bold transition hover:border-[#06275c]/35 hover:bg-[#f7f9fc] sm:px-4"
          >
            Start over
          </button>
        </div>
      </div>
    </header>
  );
}

function QuestionField({
  label,
  value,
  onChange,
  onContinue,
  placeholder,
  type = "text",
  autoComplete,
  multiline = false,
  options,
  multipleOptions = false,
  optionDisplay = "checklist",
  optionLayout = "row-first",
  compactOptions = false,
  showLabel = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onContinue?: () => void;
  placeholder?: string;
  type?: "text" | "email" | "url";
  autoComplete?: string;
  multiline?: boolean;
  options?: readonly string[];
  multipleOptions?: boolean;
  optionDisplay?: "checklist" | "dropdown";
  optionLayout?: "row-first" | "column-first";
  compactOptions?: boolean;
  showLabel?: boolean;
}) {
  const className =
    "min-h-12 w-full rounded-2xl border border-[#0a1930]/12 bg-white px-4 py-3 text-base text-[#0a1930] outline-none transition placeholder:text-[#89939f] focus:border-[#0968d8] focus:ring-4 focus:ring-[#0968d8]/10 sm:text-sm";
  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    if (
      event.key !== "Enter"
      || event.shiftKey
      || event.nativeEvent.isComposing
      || !onContinue
    ) return;
    event.preventDefault();
    onContinue();
  }

  const selectedOptions = new Set(
    multipleOptions
      ? value.split(";").map((option) => option.trim()).filter(Boolean)
      : value ? [value] : [],
  );

  function toggleOption(option: string, checked: boolean) {
    if (!options) return;
    if (!multipleOptions) {
      onChange(checked ? option : "");
      return;
    }
    const nextOptions = new Set(selectedOptions);
    if (checked) nextOptions.add(option);
    else nextOptions.delete(option);
    onChange(options.filter((item) => nextOptions.has(item)).join("; "));
  }

  const optionChecklist = options ? (
    <fieldset className={`grid gap-2 sm:grid-cols-2 ${optionLayout === "column-first" ? "sm:grid-flow-col sm:grid-rows-3" : ""}`}>
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const checked = selectedOptions.has(option);
        return (
          <label
            key={option}
            className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-3 text-sm font-semibold transition ${checked ? "border-[#0968d8]/45 bg-[#edf5ff] text-[#06275c]" : "border-[#0a1930]/10 bg-white text-[#45556b] hover:border-[#0968d8]/30"}`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => toggleOption(option, event.target.checked)}
              onKeyDown={(event) => {
                if (value) handleKeyDown(event);
              }}
              className="h-4 w-4 shrink-0 accent-[#0968d8]"
            />
            <span>{option}</span>
          </label>
        );
      })}
    </fieldset>
  ) : null;

  return (
    <div className="block">
      <span className={showLabel ? "mb-2 block text-sm font-semibold text-[#36475f]" : "sr-only"}>{label}</span>
      {options && (compactOptions || optionDisplay === "dropdown") && !multipleOptions ? (
        <select
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (value) handleKeyDown(event);
          }}
          className={`${className} cursor-pointer`}
        >
          <option value="">{placeholder}</option>
          {value && !options.includes(value) && <option value={value}>{value}</option>}
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : options && compactOptions ? (
        <details className="rounded-2xl border border-[#0a1930]/12 bg-white">
          <summary className="min-h-12 cursor-pointer px-4 py-3 text-sm font-semibold text-[#36475f]">
            {value || placeholder}
          </summary>
          <div className="border-t border-[#0a1930]/8 p-3">
            {optionChecklist}
          </div>
        </details>
      ) : options ? (
        optionChecklist
      ) : multiline ? (
        <textarea
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={4}
          className={className}
        />
      ) : (
        <input
          aria-label={label}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={className}
        />
      )}
    </div>
  );
}

function ProfileReviewField({
  definition,
  value,
  onSave,
  required = false,
  wide = false,
}: {
  definition: ProfileFieldDefinition;
  value: string;
  onSave: (value: string) => void;
  required?: boolean;
  wide?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function save() {
    onSave(draft.trim());
    setEditing(false);
  }

  return (
    <div className={`profile-review-field ${wide ? "sm:col-span-2" : ""}`}>
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <QuestionField
            label={definition.label}
            value={draft}
            onChange={setDraft}
            onContinue={save}
            placeholder={definition.placeholder}
            type={definition.type}
            autoComplete={definition.autoComplete}
            multiline={definition.multiline}
            options={definition.options}
            multipleOptions={definition.multipleOptions}
            optionDisplay={definition.optionDisplay}
            optionLayout={definition.optionLayout}
            compactOptions
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(value);
                setEditing(false);
              }}
              className="min-h-10 rounded-full border border-[#0a1930]/12 bg-white px-4 py-2 text-xs font-semibold text-[#536176]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-10 rounded-full bg-[#06275c] px-4 py-2 text-xs font-semibold text-white"
            >
              Save
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#36475f]">
              {definition.label}{" "}
              {required ? (
                <><span aria-hidden="true" className="text-[#0968d8]">*</span><span className="sr-only">Required</span></>
              ) : (
                <span className="font-semibold text-[#89939f]">(optional)</span>
              )}
            </p>
            <p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${value ? "font-medium text-[#536176]" : "text-[#89939f]"}`}>
              {value || "Not provided"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
            className="shrink-0 rounded-full border border-[#0a1930]/12 bg-white px-3.5 py-2 text-xs font-semibold text-[#084b9a] transition hover:border-[#084b9a]/35 hover:bg-[#f7f9fc]"
          >
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

function DecisionPill({ decision }: { decision: Decision }) {
  const styles: Record<Decision, string> = {
    "Pursue now": "bg-[#dff2e4] text-[#205d3a]",
    "Verify first": "bg-[#fff1ce] text-[#735511]",
    "Partner-dependent": "bg-[#efe9fb] text-[#5b3f84]",
    Watch: "bg-[#e9edef] text-[#43535c]",
    Skip: "bg-[#f8e6e1] text-[#8b3c2b]",
  };
  return <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${styles[decision]}`}>{decision}</span>;
}

function SearchExperience() {
  return (
    <section className="search-experience" aria-live="polite" aria-busy="true">
      <ThinkingOrb
        state="searching"
        size={64}
        theme="light"
        className="search-thinking-orb"
        aria-label="Researching current government opportunities"
      />
      <h1 data-stage-heading tabIndex={-1}>Researching the strongest routes</h1>
      <p>Searching official listings and filling application detail…</p>
    </section>
  );
}

function ExternalSourceConfirmation({
  prompt,
  onClose,
}: {
  prompt: ExternalSourcePrompt;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    dialogRef.current?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-50 grid overflow-y-auto bg-[#101a14]/70 px-4 py-6 backdrop-blur-sm sm:place-items-center sm:px-6">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="external-source-heading"
        aria-describedby="external-source-description"
        tabIndex={-1}
        className="m-auto w-full max-w-2xl rounded-[2rem] border border-white/20 bg-[#f7f9fc] p-5 text-[#0a1930] shadow-[0_30px_100px_rgba(8,20,12,0.35)] sm:p-8"
      >
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084b9a]">Before you leave Government Resource Finder</p>
        <h2 id="external-source-heading" className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Confirm this is still the right route.</h2>
        <p id="external-source-description" className="mt-3 text-sm leading-6 text-[#5f6f84]">
          You are about to open <strong>{prompt.title}</strong> on an external official site. Government Resource Finder currently labels this record as <strong>{prompt.context}</strong>.
        </p>

        <ol className="mt-6 grid gap-3">
          {EXTERNAL_SOURCE_CHECKS.map((item, index) => (
            <li key={item.label} className="grid grid-cols-[2rem_1fr] gap-3 rounded-2xl border border-[#0a1930]/10 bg-white p-4">
              <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-full bg-[#e7f2e9] text-xs font-black text-[#084b9a]">{index + 1}</span>
              <span>
                <span className="block text-sm font-bold">{item.label}</span>
                <span className="mt-1 block text-sm leading-6 text-[#68778b]">{item.prompt}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-5 rounded-2xl border border-[#d9b45f]/35 bg-[#fff7e5] p-4 text-sm leading-6 text-[#6c5a2d]">
          This check does not confirm eligibility, a live funding window, or application acceptance. The official record controls.
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl border border-[#0a1930]/12 bg-white px-5 py-3 text-sm font-bold"
          >
            Go back
          </button>
          <a
            href={prompt.url}
            target="_blank"
            rel="noreferrer"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#06275c] px-5 py-3 text-center text-sm font-bold text-white hover:bg-[#0968d8]"
          >
            Continue to official source
          </a>
        </div>
      </section>
    </div>
  );
}

export default function OpportunityWorkbench() {
  const [stage, setStage] = useState<Stage>("intake");
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [profileFieldOrigins, setProfileFieldOrigins] = useState<ProfileFieldOrigins>({});
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [manualText, setManualText] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [documentMessage, setDocumentMessage] = useState("");
  const [sourceEvidence, setSourceEvidence] = useState<string[]>([]);
  const [intakeStatus, setIntakeStatus] = useState<"idle" | "loading" | "error">("idle");
  const [intakeMessage, setIntakeMessage] = useState("");
  const [selectedOpportunityId, setSelectedOpportunityId] = useState("");
  const [savedOpportunityIds, setSavedOpportunityIds] = useState<string[]>([]);
  const [checklistByOpportunity, setChecklistByOpportunity] = useState<WorkspaceState["checklistByOpportunity"]>({});
  const [hydrated, setHydrated] = useState(false);
  const [grantsHealth, setGrantsHealth] = useState<SourceHealth>({ status: "idle", message: "" });
  const [, setSpendingHealth] = useState<SourceHealth>({ status: "idle", message: "" });
  const [matches, setMatches] = useState<RankedOpportunityCard[]>([]);
  const [programs, setPrograms] = useState<ProgramContextRecord[]>([]);
  const [historicalAwards, setHistoricalAwards] = useState<HistoricalAwardRecord[]>([]);
  const [sourceSummaries, setSourceSummaries] = useState<SourceSearchSummary[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error">("idle");
  const [searchError, setSearchError] = useState("");
  const [reviewMode, setReviewMode] = useState<ReviewMode>("confirm");
  const [reviewQuestionKeys, setReviewQuestionKeys] = useState<Array<keyof CompanyProfile>>([]);
  const [reviewOptionalKeys, setReviewOptionalKeys] = useState<Array<keyof CompanyProfile>>([]);
  const [reviewQuestionIndex, setReviewQuestionIndex] = useState(0);
  const [durableCredentials, setDurableCredentials] =
    useState<WorkspaceClientCredentials | null>(null);
  const [durableUnavailable, setDurableUnavailable] = useState(false);
  const [durableSaved, setDurableSaved] = useState(false);
  const [externalSourcePrompt, setExternalSourcePrompt] =
    useState<ExternalSourcePrompt | null>(null);
  const durableCredentialsRef = useRef<WorkspaceClientCredentials | null>(null);
  const durableUnavailableRef = useRef(false);
  const durableSyncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const durableGenerationRef = useRef(0);
  const lastSyncedPayloadRef = useRef("");
  const stageFocusKeyRef = useRef("");

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const stored = window.localStorage.getItem(STORAGE_KEY);
          if (!stored) return;
          const parsed = JSON.parse(stored) as StoredWorkbenchSnapshot;
          const hasCurrentApiDiscovery = parsed.version === STORAGE_VERSION
            && parsed.discoveryOrigin === "api";
          if (parsed.profile) setProfile(profileForDisplay(parsed.profile));
          if (parsed.profileFieldOrigins) setProfileFieldOrigins(parsed.profileFieldOrigins);
          if (parsed.stage) {
            const requiresDiscovery = parsed.stage === "results" || parsed.stage === "workspace";
            setStage(requiresDiscovery && !hasCurrentApiDiscovery ? "review" : parsed.stage);
          }
          const workspace = hydrateWorkspace(
            parsed.workspace ? JSON.stringify(parsed.workspace) : null,
          );
          setSelectedOpportunityId(workspace.selectedOpportunityId);
          setChecklistByOpportunity(workspace.checklistByOpportunity);
          if (parsed.sourceEvidence) setSourceEvidence(parsed.sourceEvidence);
          if (hasCurrentApiDiscovery) {
            if (parsed.matches) setMatches(parsed.matches);
            if (parsed.programs) setPrograms(parsed.programs);
            if (parsed.historicalAwards) {
              setHistoricalAwards(parsed.historicalAwards);
            }
            if (parsed.sourceSummaries) {
              setSourceSummaries(parsed.sourceSummaries);
            }
            if (parsed.searchError) {
              setSearchError(parsed.searchError);
              setSearchStatus("error");
            }
          }
          if (parsed.savedOpportunityIds) {
            setSavedOpportunityIds(parsed.savedOpportunityIds);
          }

          const credentials = parsed.durableWorkspace;
          if (
            !credentials
            || typeof credentials.workspaceId !== "string"
            || !credentials.workspaceId
            || typeof credentials.accessToken !== "string"
            || !credentials.accessToken
          ) {
            return;
          }
          durableCredentialsRef.current = credentials;
          setDurableCredentials(credentials);
          try {
            const remote = await WORKSPACE_CLIENT.get(credentials);
            if (!active) return;
            setSelectedOpportunityId(remote.workspace.selectedOpportunityId);
            setChecklistByOpportunity(
              remote.workspace.checklistByOpportunity,
            );
            setProfile((current) => profileForDisplay({
              ...current,
              founderName: remote.founderContact.name,
              founderRole: remote.founderContact.role,
              founderEmail: remote.founderContact.email,
            }));
            setProfileFieldOrigins((current) => ({
              ...current,
              ...(remote.founderContact.name ? { founderName: { origin: "founder-confirmed" as const } } : {}),
              ...(remote.founderContact.role ? { founderRole: { origin: "founder-confirmed" as const } } : {}),
              ...(remote.founderContact.email ? { founderEmail: { origin: "founder-confirmed" as const } } : {}),
            }));
            lastSyncedPayloadRef.current = JSON.stringify({
              workspace: remote.workspace,
              founderContact: remote.founderContact,
            });
            setDurableSaved(true);
          } catch (error) {
            if (!active || !(error instanceof WorkspaceClientError)) return;
            if (error.status === 401) {
              durableCredentialsRef.current = null;
              setDurableCredentials(null);
              clearStoredDurableCredentials();
            } else if (error.status === 503) {
              durableUnavailableRef.current = true;
              setDurableUnavailable(true);
            }
            setDurableSaved(false);
          }
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        } finally {
          if (active) setHydrated(true);
        }
      })();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        discoveryOrigin: "api",
        stage,
        profile,
        profileFieldOrigins,
        workspace: {
          version: 2,
          selectedOpportunityId,
          checklistByOpportunity,
        },
        sourceEvidence,
        matches,
        programs,
        historicalAwards,
        sourceSummaries,
        searchError: searchStatus === "error" ? searchError : undefined,
        savedOpportunityIds,
        durableWorkspace: durableCredentials ?? undefined,
      }),
    );
  }, [
    checklistByOpportunity,
    durableCredentials,
    historicalAwards,
    hydrated,
    matches,
    profile,
    profileFieldOrigins,
    programs,
    selectedOpportunityId,
    sourceEvidence,
    sourceSummaries,
    searchError,
    searchStatus,
    savedOpportunityIds,
    stage,
  ]);

  const stageFocusKey = `${stage}:${reviewMode}:${reviewQuestionIndex}:${searchStatus}`;
  useEffect(() => {
    if (!hydrated || stageFocusKeyRef.current === stageFocusKey) return;
    stageFocusKeyRef.current = stageFocusKey;
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.querySelector<HTMLElement>("[data-stage-heading]")
        ?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hydrated, stageFocusKey]);

  useEffect(() => {
    if (!hydrated || durableUnavailable) return;
    const input = {
      workspace: {
        version: 2 as const,
        selectedOpportunityId,
        checklistByOpportunity,
      },
      founderContact: {
        name: profile.founderName,
        role: profile.founderRole,
        email: profile.founderEmail,
      },
    };
    const payload = JSON.stringify(input);
    if (payload === lastSyncedPayloadRef.current) return;
    const generation = durableGenerationRef.current;

    const timeout = window.setTimeout(() => {
      durableSyncQueueRef.current = durableSyncQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (
            generation !== durableGenerationRef.current
            ||
            durableUnavailableRef.current
            || payload === lastSyncedPayloadRef.current
          ) {
            return;
          }
          setDurableSaved(false);
          try {
            const credentials = durableCredentialsRef.current;
            if (credentials) {
              await WORKSPACE_CLIENT.put(credentials, input);
            } else {
              const created = await WORKSPACE_CLIENT.create(input);
              if (generation !== durableGenerationRef.current) return;
              const credentials = {
                workspaceId: created.workspaceId,
                accessToken: created.accessToken,
              };
              durableCredentialsRef.current = credentials;
              setDurableCredentials(credentials);
            }
            if (generation !== durableGenerationRef.current) return;
            lastSyncedPayloadRef.current = payload;
            setDurableSaved(true);
          } catch (error) {
            if (generation !== durableGenerationRef.current) return;
            setDurableSaved(false);
            if (!(error instanceof WorkspaceClientError)) return;
            if (error.status === 401) {
              durableCredentialsRef.current = null;
              setDurableCredentials(null);
              lastSyncedPayloadRef.current = "";
              clearStoredDurableCredentials();
            } else if (error.status === 503) {
              durableUnavailableRef.current = true;
              setDurableUnavailable(true);
            }
          }
        });
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [
    checklistByOpportunity,
    durableCredentials,
    durableUnavailable,
    hydrated,
    profile.founderEmail,
    profile.founderName,
    profile.founderRole,
    selectedOpportunityId,
  ]);

  const persistedGrantsSummary = sourceSummaries.find((source) => source.family === "grants");
  const effectiveGrantsHealth: SourceHealth = grantsHealth.status === "idle" && persistedGrantsSummary
    ? { status: persistedGrantsSummary.status, message: sourceSummaryMessage(persistedGrantsSummary) }
    : grantsHealth;
  const selectedOpportunity =
    matches.find((item) => item.id === selectedOpportunityId) ??
    matches[0] ??
    null;
  const activeChecklist = selectedOpportunityId
    ? checklistByOpportunity[selectedOpportunityId] ?? {}
    : {};
  const completedCount = INITIAL_CHECKLIST.filter((item) => activeChecklist[item.id]).length;
  const applicationFieldStatus = selectedOpportunity?.applicationFields.map((field) => {
    const value = field.value
      || (field.profileKey ? profile[field.profileKey] : "");
    return { ...field, value: String(value ?? ""), known: isSupportedProfileField(field.profileKey, value) };
  }) ?? [];
  const knownApplicationFieldCount = applicationFieldStatus.filter((field) => field.known).length;
  const applicationReadinessPercent = applicationFieldStatus.length
    ? Math.round((knownApplicationFieldCount / applicationFieldStatus.length) * 100)
    : 0;
  const nextChecklistItem = INITIAL_CHECKLIST.find((item) => !activeChecklist[item.id]) ?? null;
  const saveMode: SaveMode = durableSaved
    ? "durable"
    : hydrated
      ? "device-only"
      : "saving";
  const currentReviewQuestionKey = reviewQuestionKeys[reviewQuestionIndex];
  const currentReviewQuestion = REQUIRED_PROFILE_QUESTIONS.find(
    ({ key }) => key === currentReviewQuestionKey,
  );
  const reviewOptionalFields = reviewOptionalKeys
    .map((key) => OPTIONAL_PROFILE_FIELDS.find((field) => field.key === key))
    .filter((field): field is ProfileFieldDefinition => Boolean(field));
  const reviewOptionalGroups = OPTIONAL_PROFILE_GROUPS
    .map((group) => ({
      ...group,
      fields: group.keys
        .map((key) => reviewOptionalFields.find((field) => field.key === key))
        .filter((field): field is ProfileFieldDefinition => Boolean(field)),
    }))
    .filter((group) => group.fields.length > 0);
  const missingRequiredProfileFields = REQUIRED_PROFILE_QUESTIONS.filter(
    ({ key }) => !isSupportedProfileField(key, profile[key]),
  );
  const canSaveProfile = isSupportedProfileField("founderName", profile.founderName)
    && isSupportedProfileField("founderEmail", profile.founderEmail);

  function advanceRequiredQuestion() {
    if (!currentReviewQuestion) return;
    if (!isSupportedProfileValue(profile[currentReviewQuestion.key])) return;
    if (reviewQuestionIndex === reviewQuestionKeys.length - 1) {
      setReviewMode("optional");
    } else {
      setReviewQuestionIndex((index) => index + 1);
    }
  }

  function submitFormOnEnter(
    event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    if (
      event.key !== "Enter"
      || event.shiftKey
      || event.nativeEvent.isComposing
    ) return;
    event.preventDefault();
    if (intakeStatus !== "loading") event.currentTarget.form?.requestSubmit();
  }

  function openProfileReview() {
    setReviewMode("confirm");
    setStage("review");
  }

  function resetWorkspace() {
    window.localStorage.removeItem(STORAGE_KEY);
    setStage("intake");
    setProfile(EMPTY_PROFILE);
    setProfileFieldOrigins({});
    setWebsiteUrl("");
    setManualText("");
    setUploadedFiles([]);
    setDocumentMessage("");
    setSourceEvidence([]);
    setSelectedOpportunityId("");
    setSavedOpportunityIds([]);
    setChecklistByOpportunity({});
    setIntakeMessage("");
    setMatches([]);
    setPrograms([]);
    setHistoricalAwards([]);
    setSourceSummaries([]);
    setSearchStatus("idle");
    setSearchError("");
    setReviewMode("confirm");
    setReviewQuestionKeys([]);
    setReviewOptionalKeys([]);
    setReviewQuestionIndex(0);
    setGrantsHealth({ status: "idle", message: "" });
    setSpendingHealth({ status: "idle", message: "" });
    durableCredentialsRef.current = null;
    setDurableCredentials(null);
    durableUnavailableRef.current = false;
    setDurableUnavailable(false);
    durableGenerationRef.current += 1;
    lastSyncedPayloadRef.current = "";
    setDurableSaved(false);
    setExternalSourcePrompt(null);
  }

  async function continueIntake(event: FormEvent) {
    event.preventDefault();
    if (intakeStatus === "loading") return;
    const hasWebsite = websiteUrl.trim().length > 0;
    const hasEvidence = manualText.trim().length >= 35;
    const hasFiles = uploadedFiles.length > 0;
    if (!hasWebsite && !hasEvidence && !hasFiles) {
      setIntakeStatus("error");
      setIntakeMessage("Add a public website, a file, or a few sentences about the company before continuing.");
      return;
    }
    setIntakeStatus("loading");
    setIntakeMessage("");
    try {
      const form = new FormData();
      if (hasWebsite) form.set("website", websiteUrl.trim());
      if (hasEvidence) form.set("manualText", manualText.trim());
      for (const upload of uploadedFiles) form.append("files", upload.file, upload.name);

      const response = await fetch("/api/intake/bundle", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as EvidenceBundleResponse;
      if (!response.ok || !result.profile) {
        throw new Error(result.error ?? result.fallback ?? "Evidence review failed.");
      }
      const extractedProfile = pickSupportedEvidenceProfile(result.profile);
      const nextProfile: CompanyProfile = {
        ...EMPTY_PROFILE,
        ...extractedProfile,
        website: websiteUrl.trim(),
      };
      const sourceNames = new Map((result.sources ?? []).map((source) => [source.id, source.displayName]));
      const nextEvidence = result.evidence?.length
        ? result.evidence.map((item) => `${item.field}: extracted from ${sourceNames.get(item.sourceId ?? "") ?? "submitted evidence"}.`)
        : (result.sources ?? [])
          .filter((source) => source.extractionStatus === "extracted" || source.extractionStatus === "provided-text")
          .map((source) => `Company evidence: reviewed from ${source.displayName}.`);
      const messages = result.warnings ?? [];
      const sourceWarnings = (result.sources ?? []).flatMap((source) => source.message ? [source.message] : []);
      setDocumentMessage(sourceWarnings[0] ?? "Website and file evidence were reviewed together.");

      const displayProfile = profileForDisplay(nextProfile);
      const requiredQuestionKeys = REQUIRED_PROFILE_QUESTIONS
        .filter(({ key }) => !isSupportedProfileField(key, displayProfile[key]))
        .map(({ key }) => key);
      const optionalQuestionKeys = OPTIONAL_PROFILE_FIELDS
        .filter(({ key }) => !isSupportedProfileField(key, displayProfile[key]))
        .map(({ key }) => key);
      setProfile(displayProfile);
      setProfileFieldOrigins(normalizedProfileOrigins(
        result,
        displayProfile,
        null,
        hasWebsite,
      ));
      setReviewQuestionKeys(requiredQuestionKeys);
      setReviewOptionalKeys(optionalQuestionKeys);
      setReviewQuestionIndex(0);
      setReviewMode(requiredQuestionKeys.length ? "required" : "optional");
      setMatches([]);
      setPrograms([]);
      setHistoricalAwards([]);
      setSourceSummaries([]);
      setSourceEvidence(nextEvidence);
      setIntakeStatus("idle");
      setIntakeMessage(messages[0] ?? intakeResultMessage(result));
      setStage("review");
    } catch (error) {
      setIntakeStatus("error");
      setIntakeMessage(
        error instanceof Error
          ? error.message
          : "Continue with a plain-language company description.",
      );
    }
  }

  async function acceptFiles(selected: File[]) {
    if (!selected.length) return;
    const room = Math.max(0, 5 - uploadedFiles.length);
    const accepted = selected.slice(0, room);
    if (selected.length > room) setDocumentMessage("You can upload up to 5 files.");

    const nextFiles: UploadedFile[] = [];
    for (const file of accepted) {
      const extension = file.name.toLowerCase().split(".").pop();
      if (extension !== "pdf" && extension !== "docx" && extension !== "pptx") {
        setDocumentMessage("Use a PDF, Word (.docx), or PowerPoint (.pptx) file.");
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        setDocumentMessage(`${file.name} is over the 10 MB limit.`);
        continue;
      }
      nextFiles.push({ name: file.name, size: file.size, kind: extension, file });
    }
    setUploadedFiles((current) => [...current, ...nextFiles].slice(0, 5));
    if (nextFiles.length) setDocumentMessage(`${nextFiles.length} file${nextFiles.length === 1 ? "" : "s"} attached and ready for review.`);
  }

  async function handleDocuments(event: ChangeEvent<HTMLInputElement>) {
    const selected = [...(event.target.files ?? [])];
    await acceptFiles(selected);
    event.target.value = "";
  }

  function updateProfile(key: keyof CompanyProfile, value: string) {
    const nextValue = isSupportedProfileValue(value) ? value : "";
    setProfile((current) => ({ ...current, [key]: nextValue }));
    setProfileFieldOrigins((current) => ({
      ...current,
      [key]: isSupportedProfileValue(nextValue)
        ? { origin: "founder-confirmed" }
        : { origin: "unknown" },
    }));
  }

  async function buildMap() {
    const confirmedProfile = profile;
    setProfile(confirmedProfile);
    setSearchStatus("loading");
    setSearchError("");
    setStage("review");
    setSelectedOpportunityId("");
    setGrantsHealth({ status: "checking", message: "Searching Grants.gov for current opportunities…" });
    setSpendingHealth({ status: "checking", message: "Searching historical award sources…" });
    try {
      const response = await fetch("/api/opportunities/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: confirmedProfile,
        }),
      });
      const result = (await response.json()) as GovernmentSourceSearchResult & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Government source search failed.");
      setMatches(result.discovery.recommendations.map(mapDiscoveryRecommendation));
      setPrograms([...result.discovery.programs]);
      setHistoricalAwards([...result.discovery.historicalAwards]);
      setSourceSummaries([...result.sources]);
      const grants = result.sources.find((source) => source.family === "grants");
      const spending = result.sources.find((source) => source.family === "usaspending");
      setGrantsHealth({
        status: grants?.status ?? "unavailable",
        message: grants?.warning ?? `${grants?.recordCount ?? 0} validated Grants.gov record${grants?.recordCount === 1 ? "" : "s"} normalized for matching.`,
      });
      setSpendingHealth({
        status: spending?.status ?? "unavailable",
        message: spending?.warning ?? `${spending?.recordCount ?? 0} historical USAspending record${spending?.recordCount === 1 ? "" : "s"} kept separate from recommendations.`,
      });
      setSearchStatus("idle");
      setStage("results");
    } catch (error) {
      setMatches([]);
      setPrograms([]);
      setHistoricalAwards([]);
      setSourceSummaries([]);
      setGrantsHealth({
        status: "unavailable",
        message: error instanceof Error
          ? error.message
          : "Government sources could not be searched.",
      });
      setSpendingHealth({ status: "unavailable", message: "" });
      setSearchStatus("error");
      setSearchError(
        error instanceof Error && error.message.trim()
          ? error.message.trim().slice(0, 280)
          : "Government sources could not be searched. Please try again.",
      );
      setStage("results");
    }
  }

  function openWorkspace(opportunity: OpportunityCard) {
    setSelectedOpportunityId(opportunity.id);
    setStage("workspace");
  }

  return (
    <main className="app-shell flex min-h-screen flex-col overflow-x-hidden text-[#0a1930]">
      <AppHeader onReset={resetWorkspace} saveMode={saveMode} />
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 pb-4 pt-6 sm:px-8 sm:pt-7 lg:px-12">
        {stage !== "intake" && <StepRail stage={stage} />}

        {stage === "intake" && (
          <section className="intake-hero pt-10 lg:pt-14">
            <div className="intake-hero-grid grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
              <div className="intake-hero-copy lg:sticky lg:top-28">
                <h1 data-stage-heading tabIndex={-1} className="max-w-xl text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.05em] sm:text-5xl">
                  Find the right government resources for your startup.
                </h1>
                <div className="mt-6">
                  <StepRail stage="intake" />
                </div>
              </div>

              <div className="intake-panel p-5 sm:p-6">
                <form onSubmit={continueIntake}>
                  <label htmlFor="website-url" className="block text-sm font-bold text-[#36475f]">Company website</label>
                  <input
                    id="website-url"
                    type="url"
                    value={websiteUrl}
                    onChange={(event) => setWebsiteUrl(event.target.value)}
                    onKeyDown={submitFormOnEnter}
                    placeholder="https://yourcompany.com"
                    className="mt-2 w-full rounded-xl border border-[#0a1930]/12 bg-white px-4 py-3.5 text-base outline-none transition-[border-color,box-shadow] focus:border-[#0968d8] focus:ring-4 focus:ring-[#0968d8]/10"
                  />

                  <div className="mt-5">
                    <label
                      className="relative grid cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed border-[#0968d8]/35 bg-[#f5f8fc] px-5 py-6 text-center transition hover:border-[#0968d8]"
                      onDragOver={(event) => {
                        event.preventDefault();
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        void acceptFiles([...event.dataTransfer.files]);
                      }}
                    >
                      <input
                        type="file"
                        multiple
                        accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx"
                        className="absolute inset-0 z-10 cursor-pointer opacity-0"
                        onChange={handleDocuments}
                        disabled={uploadedFiles.length >= 5}
                      />
                      <span className="text-sm font-bold">Add PDF, Word, or PowerPoint files</span>
                      <span className="mt-1 text-xs text-[#718095]">Drop files here or click to browse. Up to 5 files, 10 MB each</span>
                    </label>
                    {uploadedFiles.length > 0 && (
                      <ul className="mt-3 grid gap-2" aria-label="Attached files">
                        {uploadedFiles.map((file) => (
                          <li key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-xl border border-[#0a1930]/8 bg-white px-3 py-2 text-sm">
                            <span className="min-w-0 truncate"><strong>{file.name}</strong> <span className="text-[#718095]">· ready to review</span></span>
                            <button type="button" onClick={() => setUploadedFiles((current) => current.filter((item) => item !== file))} className="shrink-0 text-xs font-bold text-[#5e6c80]">Remove</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {documentMessage && <p className="mt-2 text-xs leading-5 text-[#68778b]">{documentMessage}</p>}
                  </div>

                  <label htmlFor="manual-summary" className="mt-5 block text-sm font-bold text-[#36475f]">Paste a description, pitch, or notes</label>
                  <textarea
                    id="manual-summary"
                    value={manualText}
                    onChange={(event) => setManualText(event.target.value)}
                    onKeyDown={submitFormOnEnter}
                    rows={5}
                    placeholder="Describe the product, customers, location, project, and what funding would support. This is evidence, not the final company description."
                    className="mt-2 w-full rounded-xl border border-[#0a1930]/12 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-[#0968d8] focus:ring-4 focus:ring-[#0968d8]/10"
                  />

                  {intakeStatus === "loading" && (
                    <div className="mt-4 grid place-items-center rounded-2xl border border-[#0a1930]/8 bg-[#f7f9fc] px-4 py-6" aria-live="polite" aria-busy="true">
                      <ThinkingOrb
                        state="searching"
                        size={64}
                        theme="light"
                        className="search-thinking-orb"
                        aria-label="Building your profile"
                      />
                      <p className="mt-3 text-sm font-bold text-[#36475f]">Building your profile…</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={intakeStatus === "loading"}
                    className="mt-4 w-full rounded-xl bg-[#06275c] px-5 py-4 text-sm font-bold text-white transition hover:bg-[#084b9a] disabled:cursor-wait disabled:opacity-65"
                  >
                    {intakeStatus === "loading" ? (
                      "Building your profile…"
                    ) : (
                      "Continue"
                    )}
                  </button>
                </form>

                {intakeMessage && (
                  <div role={intakeStatus === "error" ? "alert" : "status"} className={`mt-4 rounded-2xl px-4 py-3 text-sm ${intakeStatus === "error" ? "bg-[#fff0e9] text-[#8b3c21]" : "bg-[#edf5ef] text-[#084b9a]"}`}>
                    {intakeMessage}
                  </div>
                )}

              </div>
            </div>
          </section>
        )}

        {stage === "review" && searchStatus === "loading" && <SearchExperience />}

        {stage === "review" && searchStatus !== "loading" && reviewMode === "required" && currentReviewQuestion && (
          <section className="approval-flow mx-auto max-w-2xl pt-12 sm:pt-16">
            <div className="approval-flow-heading">
              <p>Required question {reviewQuestionIndex + 1} of {reviewQuestionKeys.length}</p>
              <h1 data-stage-heading tabIndex={-1}>{currentReviewQuestion.question}</h1>
              <p>{currentReviewQuestion.why}</p>
            </div>
            <div className="approval-question-card">
              <div className="approval-question-body">
                <QuestionField
                  label={currentReviewQuestion.label}
                  value={String(profile[currentReviewQuestion.key] ?? "")}
                  onChange={(value) => updateProfile(currentReviewQuestion.key, value)}
                  onContinue={advanceRequiredQuestion}
                  placeholder={currentReviewQuestion.placeholder}
                  type={currentReviewQuestion.type}
                  autoComplete={currentReviewQuestion.autoComplete}
                  multiline={currentReviewQuestion.multiline}
                  options={currentReviewQuestion.options}
                  multipleOptions={currentReviewQuestion.multipleOptions}
                  optionDisplay={currentReviewQuestion.optionDisplay}
                  optionLayout={currentReviewQuestion.optionLayout}
                  showLabel={false}
                />
              </div>
              <div className="approval-question-footer">
                <button
                  type="button"
                  onClick={() => reviewQuestionIndex > 0 ? setReviewQuestionIndex((index) => index - 1) : setStage("intake")}
                  className="approval-back-button"
                >
                  Back
                </button>
                <ProgressRail current={reviewQuestionIndex} total={reviewQuestionKeys.length + 2} />
                <button
                  type="button"
                  disabled={!isSupportedProfileValue(profile[currentReviewQuestion.key])}
                  onClick={advanceRequiredQuestion}
                  className="approval-continue-button"
                >
                  {reviewQuestionIndex === reviewQuestionKeys.length - 1 ? "Optional details" : "Continue"}
                </button>
              </div>
            </div>
          </section>
        )}

        {stage === "review" && searchStatus !== "loading" && reviewMode === "optional" && (
          <section className="approval-flow mx-auto max-w-4xl pt-12 sm:pt-16">
            <div className="approval-flow-heading">
              <p>Optional details</p>
              <h1 data-stage-heading tabIndex={-1}>Anything else you want to add?</h1>
              <p>Add any remaining details that are useful to you. These fields are optional, and you can leave every one blank.</p>
            </div>
            <div className="approval-question-card">
              <div className="approval-question-body">
                {reviewOptionalFields.length ? (
                  <div className="space-y-9">
                    {reviewOptionalGroups.map((group) => (
                      <section key={group.title}>
                        <div className="mb-5">
                          <h2 className="text-2xl font-semibold tracking-[-0.035em] text-[#0a1930] sm:text-3xl">{group.title}</h2>
                          <p className="mt-2 text-sm leading-6 text-[#68778b]">{group.description}</p>
                        </div>
                        <div className="grid gap-5 sm:grid-cols-2">
                          {group.fields.map((field) => (
                            <div key={field.key} className={field.multiline || field.options ? "sm:col-span-2" : ""}>
                              <QuestionField
                                label={field.question}
                                value={String(profile[field.key] ?? "")}
                                onChange={(value) => updateProfile(field.key, value)}
                                onContinue={() => setReviewMode("save")}
                                placeholder={field.placeholder}
                                type={field.type}
                                autoComplete={field.autoComplete}
                                multiline={field.multiline}
                                options={field.options}
                                multipleOptions={field.multipleOptions}
                                optionDisplay={field.optionDisplay}
                                optionLayout={field.optionLayout}
                              />
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm leading-6 text-[#5f6f84]">Your intake already included every optional profile field. Continue to review the completed profile.</p>
                )}
              </div>
              <div className="approval-question-footer">
                <button
                  type="button"
                  onClick={() => {
                    if (reviewQuestionKeys.length) {
                      setReviewMode("required");
                      setReviewQuestionIndex(reviewQuestionKeys.length - 1);
                    } else {
                      setStage("intake");
                    }
                  }}
                  className="approval-back-button"
                >
                  Back
                </button>
                <div className="grid justify-items-center gap-2">
                  <ProgressRail current={reviewQuestionKeys.length} total={reviewQuestionKeys.length + 2} />
                  <p className="text-center text-xs font-semibold text-[#68778b]">
                    {reviewOptionalFields.length
                      ? `${reviewOptionalFields.length} optional field${reviewOptionalFields.length === 1 ? "" : "s"}`
                      : "Optional details complete"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewMode("save")}
                  className="approval-continue-button"
                >
                  Continue
                </button>
              </div>
            </div>
          </section>
        )}

        {stage === "review" && searchStatus !== "loading" && reviewMode === "confirm" && (
          <section className="pt-10">
            <div>
              <div>
                <h1 data-stage-heading tabIndex={-1} className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Confirm your profile.</h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-[#5f6f84]">Review the completed profile below. Choose Edit beside any value you want to change, then save that field when you are done.</p>
              </div>
            </div>

            <div className="mt-8 max-w-5xl space-y-6">
              <section className="rounded-[2rem] border border-[#0a1930]/10 bg-white/88 p-5 shadow-[0_20px_65px_rgba(23,33,27,0.05)] sm:p-8">
                {PROFILE_REVIEW_GROUPS.map((group, groupIndex) => (
                  <section
                    key={group.title}
                    className={groupIndex > 0 ? "mt-10 border-t border-[#0a1930]/8 pt-10" : ""}
                  >
                    <div className="pb-5">
                      <h2 className="text-3xl font-semibold tracking-[-0.04em] sm:text-[2.15rem]">{group.title}</h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5f6f84]">{group.description}</p>
                    </div>
                    <div className="grid sm:grid-cols-2">
                      {group.keys.map((key) => {
                        const definition = PROFILE_FIELD_DEFINITIONS.find((field) => field.key === key);
                        if (!definition) return null;
                        return (
                          <ProfileReviewField
                            key={key}
                            definition={definition}
                            value={String(profile[key] ?? "")}
                            onSave={(value) => updateProfile(key, value)}
                            required={REQUIRED_PROFILE_FIELD_KEYS.has(key)}
                            wide={Boolean(definition.multiline || definition.multipleOptions)}
                          />
                        );
                      })}
                    </div>
                  </section>
                ))}
              </section>

              <section className="rounded-[2rem] border border-[#0a1930]/10 bg-white/88 p-5 shadow-[0_20px_65px_rgba(23,33,27,0.05)] sm:p-8">
                <div className="pb-5">
                  <h2 className="text-3xl font-semibold tracking-[-0.04em] sm:text-[2.15rem]">Your profile</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5f6f84]">Optional contact details used only when you choose to save this profile.</p>
                </div>
                <div className="grid sm:grid-cols-2">
                  {SAVE_PROFILE_FIELDS.map((definition) => (
                    <ProfileReviewField
                      key={definition.key}
                      definition={definition}
                      value={String(profile[definition.key] ?? "")}
                      onSave={(value) => updateProfile(definition.key, value)}
                      wide={definition.key === "founderEmail"}
                    />
                  ))}
                </div>
              </section>

              <div className="flex flex-col gap-4 py-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-xl text-sm leading-6 text-[#5f6f84]">
                  {missingRequiredProfileFields.length
                    ? `Complete ${missingRequiredProfileFields.map((field) => field.label.toLowerCase()).join(", ")} before continuing.`
                    : "Your required profile details are complete. Optional blank fields will stay blank."}
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      setReviewOptionalKeys(OPTIONAL_PROFILE_FIELDS
                        .filter(({ key }) => !isSupportedProfileField(key, profile[key]))
                        .map(({ key }) => key));
                      setReviewMode("optional");
                    }}
                    className="min-h-12 rounded-xl border border-[#0a1930]/12 bg-white px-5 py-3 text-sm font-semibold text-[#536176]"
                  >
                    Review optional details
                  </button>
                  <button
                    type="button"
                    onClick={() => void buildMap()}
                    disabled={missingRequiredProfileFields.length > 0}
                    className="min-h-12 rounded-xl bg-[#06275c] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#084b9a] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Find my resources
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {stage === "review" && searchStatus !== "loading" && reviewMode === "save" && (
          <section className="approval-flow mx-auto max-w-3xl pt-12 sm:pt-16">
            <div className="approval-flow-heading">
              <p>Save profile</p>
              <h1 data-stage-heading tabIndex={-1}>Would you like to save your profile?</h1>
              <p>Add contact details so they can stay with this profile, or skip this step and continue without them.</p>
            </div>
            <div className="approval-question-card">
              <div className="approval-question-body">
                <div className="grid gap-5 sm:grid-cols-2">
                  {SAVE_PROFILE_FIELDS.map((field) => (
                    <div key={field.key} className={field.key === "founderEmail" ? "sm:col-span-2" : ""}>
                      <QuestionField
                        label={field.question}
                        value={String(profile[field.key] ?? "")}
                        onChange={(value) => updateProfile(field.key, value)}
                        onContinue={() => {
                          if (canSaveProfile) setReviewMode("confirm");
                        }}
                        placeholder={field.placeholder}
                        type={field.type}
                        autoComplete={field.autoComplete}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-5 text-[#68778b]">Name and email are needed to save contact details. Role is optional.</p>
              </div>
              <div className="grid gap-4 border-t border-[#0a1930]/10 bg-[rgba(247,241,229,0.62)] p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
                <button type="button" onClick={() => setReviewMode("optional")} className="approval-back-button">Back</button>
                <div className="flex justify-center">
                  <ProgressRail current={reviewQuestionKeys.length + 1} total={reviewQuestionKeys.length + 2} />
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setReviewMode("confirm")}
                    className="min-h-11 rounded-xl border border-[#0a1930]/12 bg-white px-5 py-3 text-sm font-semibold text-[#536176]"
                  >
                    Skip for now
                  </button>
                  <button
                    type="button"
                    disabled={!canSaveProfile}
                    onClick={() => setReviewMode("confirm")}
                    className="approval-continue-button disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Save and review profile
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {stage === "results" && (
          <ResourceDashboard
            matches={matches.filter((match) => match.decision !== "Skip")}
            profile={profile}
            savedOpportunityIds={savedOpportunityIds}
            checklistByOpportunity={checklistByOpportunity}
            sourceMessage={effectiveGrantsHealth.message || "Official source status is available inside each expanded result."}
            searchError={searchStatus === "error" ? searchError : ""}
            onSavedChange={setSavedOpportunityIds}
            onChecklistChange={(opportunityId, itemId, checked) => {
              setSelectedOpportunityId(opportunityId);
              setChecklistByOpportunity((current) => setChecklistItem(
                { version: 2, selectedOpportunityId: opportunityId, checklistByOpportunity: current },
                opportunityId,
                itemId,
                checked,
              ).checklistByOpportunity);
            }}
            onEditProfile={openProfileReview}
            onRetry={() => void buildMap()}
            onOpenWorkspace={openWorkspace}
            onOpenSource={(opportunity) => setExternalSourcePrompt({
              url: opportunity.sourceUrl,
              title: opportunity.title,
              context: opportunity.sourceKind,
            })}
          />
        )}

        {stage === "workspace" && selectedOpportunity && (
          <section className="pt-8 sm:pt-10">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#0968d8]">Application workspace</p>
                <h1 data-stage-heading tabIndex={-1} className="mt-3 max-w-4xl text-balance text-[2.5rem] font-semibold leading-[1.02] tracking-[-0.05em] sm:text-5xl">Move forward without inventing an answer.</h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-[#5f6f84]">Known facts are organized below and unsupported answers stay visibly blank. Nothing here submits to a government system.</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#edf5ef] px-3 py-1.5 text-xs font-bold text-[#084b9a]">{knownApplicationFieldCount} of {applicationFieldStatus.length} prefill fields ready</span>
                  <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#5f6f84]">{completedCount} of {INITIAL_CHECKLIST.length} tasks complete</span>
                  <span className="rounded-full border border-[#0a1930]/10 bg-white/55 px-3 py-1.5 text-xs font-bold text-[#5f6f84]">
                    {saveMode === "durable"
                      ? "Saved durably"
                      : saveMode === "device-only"
                        ? "Saved privately on this device only"
                        : "Saving privately on this device"}
                  </span>
                </div>
              </div>
              <button type="button" onClick={() => setStage("results")} className="min-h-11 w-fit rounded-full border border-[#0a1930]/12 bg-white px-4 py-2.5 text-sm font-bold transition hover:border-[#06275c]/30 hover:bg-[#f7f9fc]">Back to opportunities</button>
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
              <div className="space-y-6">
                <div className="overflow-hidden rounded-[2rem] border border-[#0a1930]/10 bg-[#06275c] text-white shadow-[0_24px_70px_rgba(23,61,44,0.16)]">
                  <div className="p-6 sm:p-8">
                    <div className="flex flex-wrap items-center gap-2">
                      <DecisionPill decision={selectedOpportunity.decision} />
                      <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold">Not submitted</span>
                      <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold">Evidence {selectedOpportunity.score}/100</span>
                    </div>
                    <p className="mt-7 text-xs font-bold uppercase tracking-[0.15em] text-[#acd8ba]">{selectedOpportunity.agency}</p>
                    <h2 className="mt-2 max-w-3xl text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">{selectedOpportunity.title}</h2>
                    <p className="mt-4 max-w-3xl text-sm leading-6 text-white/75">{selectedOpportunity.relationship}</p>
                    <div className="mt-7 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/10 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#acd8ba]">Deadline</p><p className="mt-2 text-sm font-bold">{selectedOpportunity.deadline}</p></div>
                      <div className="rounded-2xl border border-white/10 bg-white/10 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#acd8ba]">Potential value</p><p className="mt-2 text-sm font-bold">{selectedOpportunity.amount}</p></div>
                      <div className="rounded-2xl border border-white/10 bg-white/10 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#acd8ba]">Source</p><p className="mt-2 text-sm font-bold">{selectedOpportunity.sourceLabel}</p></div>
                    </div>
                  </div>
                  <div className="border-t border-white/10 bg-black/10 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-8">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#acd8ba]">Best next action</p>
                      <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/90">{selectedOpportunity.nextAction}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExternalSourcePrompt({
                        url: selectedOpportunity.sourceUrl,
                        title: selectedOpportunity.title,
                        context: selectedOpportunity.sourceKind,
                      })}
                      className="mt-4 inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#06275c] transition hover:bg-[#edf6ef] sm:mt-0"
                    >
                      Review official instructions
                    </button>
                  </div>
                </div>

                <div className="rounded-[2rem] border border-[#0a1930]/10 bg-white/85 p-5 shadow-[0_20px_65px_rgba(23,33,27,0.05)] sm:p-8">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#68778b]">Prefill map</p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Known versus missing</h2>
                      <p className="mt-2 text-sm leading-6 text-[#68778b]">Only founder-confirmed values can move into an application draft.</p>
                    </div>
                    <div className="shrink-0 sm:text-right">
                      <p className="text-2xl font-semibold tracking-[-0.04em] text-[#084b9a]">{applicationReadinessPercent}%</p>
                      <p className="text-xs font-bold text-[#68778b]">prefill readiness</p>
                    </div>
                  </div>
                  <div role="progressbar" aria-label="Application prefill readiness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={applicationReadinessPercent} className="mt-5 h-2 overflow-hidden rounded-full bg-[#e4e8e2]">
                    <div className="h-full rounded-full bg-[#4c9b67] transition-all" style={{ width: `${applicationReadinessPercent}%` }} />
                  </div>
                  <div className="mt-6 grid gap-3">
                    {applicationFieldStatus.map((field) => (
                      <div key={field.label} className={`grid gap-3 rounded-2xl border p-4 sm:grid-cols-[0.32fr_0.68fr] sm:items-start ${field.known ? "border-[#7eb08e]/25 bg-[#f3f8f4]" : "border-[#d9b45f]/30 bg-[#fffaf0]"}`}>
                        <div className="flex items-center justify-between gap-3 sm:block">
                          <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#718095]">{field.label}</p>
                          <span className={`mt-0 inline-flex rounded-full px-2 py-1 text-[10px] font-bold sm:mt-2 ${field.known ? "bg-[#dff2e4] text-[#205d3a]" : "bg-[#fff1ce] text-[#735511]"}`}>{field.known ? "Ready" : "Founder needed"}</span>
                        </div>
                        <div>
                          {field.profileKey ? (
                            <textarea
                              value={String(field.value ?? "")}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                updateProfile(field.profileKey as keyof CompanyProfile, nextValue);
                                if (!selectedOpportunity) return;
                                setMatches((current) => current.map((item) => (
                                  item.id !== selectedOpportunity.id
                                    ? item
                                    : {
                                      ...item,
                                      applicationFields: item.applicationFields.map((row) => (
                                        row.label === field.label ? { ...row, value: nextValue } : row
                                      )),
                                    }
                                )));
                              }}
                              rows={field.label.toLowerCase().includes("summary") || field.label.toLowerCase().includes("apply") ? 3 : 2}
                              className="w-full rounded-xl border border-[#0a1930]/12 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#0968d8]"
                            />
                          ) : (
                            <textarea
                              value={String(field.value ?? "")}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                if (!selectedOpportunity) return;
                                setMatches((current) => current.map((item) => (
                                  item.id !== selectedOpportunity.id
                                    ? item
                                    : {
                                      ...item,
                                      applicationFields: item.applicationFields.map((row) => (
                                        row.label === field.label ? { ...row, value: nextValue } : row
                                      )),
                                    }
                                )));
                              }}
                              rows={2}
                              className="w-full rounded-xl border border-[#0a1930]/12 bg-white px-3 py-2 text-sm leading-6 outline-none focus:border-[#0968d8]"
                              placeholder="Leave blank until you have a supported answer"
                            />
                          )}
                          <p className="mt-1 text-xs leading-5 text-[#8a938d]">{field.note ?? (field.known ? "From the founder-confirmed company profile" : "No supported value is stored")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <aside className="space-y-5 xl:sticky xl:top-24">
                <div className="rounded-[2rem] border border-[#0a1930]/10 bg-white/90 p-5 shadow-[0_20px_65px_rgba(23,33,27,0.05)] sm:p-7">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#68778b]">Persistent checklist</p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">{completedCount} of {INITIAL_CHECKLIST.length} complete</h2>
                    </div>
                    <span aria-live="polite" className="text-sm font-bold text-[#084b9a]">{Math.round((completedCount / INITIAL_CHECKLIST.length) * 100)}%</span>
                  </div>
                  <div role="progressbar" aria-label="Application checklist progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((completedCount / INITIAL_CHECKLIST.length) * 100)} className="mt-4 h-2 overflow-hidden rounded-full bg-[#e4e8e2]">
                    <div className="h-full rounded-full bg-[#4c9b67] transition-all" style={{ width: `${(completedCount / INITIAL_CHECKLIST.length) * 100}%` }} />
                  </div>
                  {nextChecklistItem && (
                    <div className="mt-5 rounded-2xl bg-[#f3f6fa] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#68778b]">Next unfinished step</p>
                      <p className="mt-2 text-sm font-bold leading-5 text-[#253d2e]">{nextChecklistItem.label}</p>
                    </div>
                  )}
                  <div className="mt-5">
                    <TaskRows
                      items={INITIAL_CHECKLIST}
                      checked={activeChecklist}
                      onChange={(itemId, checked) => {
                          if (!selectedOpportunityId) return;
                          setChecklistByOpportunity((current) => setChecklistItem(
                            { version: 2, selectedOpportunityId, checklistByOpportunity: current },
                            selectedOpportunityId,
                            itemId,
                            checked,
                          ).checklistByOpportunity);
                      }}
                    />
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-[#d9b45f]/35 bg-[#fff7e5] p-6">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#795c19]">Required verification</p>
                  <p className="mt-3 text-sm leading-6 text-[#6c5a2d]">Eligibility remains unconfirmed until the exact current notice, applicant rules, deadline, registrations, and project scope are checked on the official source.</p>
                  <p className="mt-3 border-t border-[#795c19]/10 pt-3 text-xs font-semibold leading-5 text-[#7b6838]">This workspace organizes research only. It never submits or signs a government application.</p>
                </div>
              </aside>
            </div>
          </section>
        )}

        {externalSourcePrompt && (
          <ExternalSourceConfirmation
            prompt={externalSourcePrompt}
            onClose={() => setExternalSourcePrompt(null)}
          />
        )}

      </div>
      <footer className="mt-auto text-xs text-[#68736c]">
        <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-8 lg:px-12">
          <p>Research aid only. Verify eligibility and instructions on the official source.</p>
        </div>
      </footer>
    </main>
  );
}
