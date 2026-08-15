"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { EXTERNAL_PROCESSING_DISCLOSURE } from "@/lib/intake/external-processing";
import { pickSupportedEvidenceProfile } from "@/lib/intake/evidence-profile";
import { createEvidenceOnlyFounderProfile } from "@/lib/intake/profile-normalization";
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
import ResourceDashboard from "./resource-dashboard";

type Stage = "intake" | "review" | "results" | "workspace";
type FitTier = "Likely Fit" | "Potential Fit" | "Adjacent";
type Decision = "Pursue now" | "Verify first" | "Partner-dependent" | "Watch" | "Skip";
type SaveMode = "saving" | "device-only" | "durable";

export type CompanyProfile = {
  companyName: string;
  founderName: string;
  founderRole: string;
  founderEmail: string;
  website: string;
  description: string;
  industry: string;
  technology: string;
  location: string;
  employees: string;
  revenue: string;
  capitalRaised: string;
  capitalNeed: string;
  useOfFunds: string;
  customers: string;
  researchActivities: string;
  applicantType: string;
  ownership: string;
  samStatus: string;
  uei: string;
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
  applicationFields: Array<{ label: string; profileKey?: keyof CompanyProfile; note?: string }>;
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
  extraction: "read" | "paste-needed";
};

const REQUIRED_REVIEW_QUESTIONS: Array<{
  key: keyof CompanyProfile;
  label: string;
  why: string;
  placeholder: string;
  multiline?: boolean;
}> = [
  { key: "companyName", label: "What is the company called?", why: "We use this to keep your profile and saved work clear.", placeholder: "Company name" },
  { key: "description", label: "What does the company build?", why: "A specific product and problem produce stronger matches than broad industry terms.", placeholder: "Describe the product and the problem it solves", multiline: true },
  { key: "location", label: "Where is the company based?", why: "Some routes have state, domestic, or place-of-performance rules.", placeholder: "City, state, country" },
  { key: "applicantType", label: "What kind of applicant are you?", why: "Applicant type is one of the most common hard eligibility boundaries.", placeholder: "For-profit small business, nonprofit, university…" },
  { key: "ownership", label: "How is the company owned and controlled?", why: "Some small-business and research programs have ownership requirements.", placeholder: "Founder-owned, venture-backed, subsidiary…" },
  { key: "useOfFunds", label: "What would the funding support?", why: "This separates a real public-purpose project from general business funding.", placeholder: "Research, pilot, equipment, hiring…", multiline: true },
];

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
  employees: "",
  revenue: "",
  capitalRaised: "",
  capitalNeed: "",
  useOfFunds: "",
  customers: "",
  researchActivities: "",
  applicantType: "Unknown",
  ownership: "Unknown",
  samStatus: "Unknown",
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
  const { opportunity, match } = recommendation;
  const eligibilityChecks = match.eligibility
    .filter((check) => check.state !== "pass")
    .map((check) => check.detail);
  const reasons = [
    match.reason,
    ...(match.matchedConceptGroups.length
      ? [`Matched evidence groups: ${match.matchedConceptGroups.join(", ")}.`]
      : []),
  ];
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
    relationship: match.reason,
    reasons,
    concerns: eligibilityChecks.length
      ? eligibilityChecks
      : ["Verify every notice-specific eligibility rule on the official source."],
    nextAction: "Open the official notice and check the applicant type, registrations, project scope, and deadline.",
    applicationFields: COMMON_APPLICATION_FIELDS,
    score: match.score.total,
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
const WORKSPACE_CLIENT = createWorkspaceClient();
const SAVE_MODE_CONTENT: Record<
  SaveMode,
  { announcement: string; label: string; dotClassName: string }
> = {
  saving: {
    announcement: "Saving workspace on this device",
    label: "Saving on this device",
    dotClassName: "bg-[#d1a24b]",
  },
  "device-only": {
    announcement: "Workspace saved on this device only",
    label: "Device-only save",
    dotClassName: "bg-[#d1a24b]",
  },
  durable: {
    announcement: "Workspace saved durably",
    label: "Durable save",
    dotClassName: "bg-[#4c9b67]",
  },
};
interface StoredWorkbenchSnapshot {
  stage?: Stage;
  profile?: CompanyProfile;
  selectedOpportunityId?: string;
  workspace?: WorkspaceState;
  sourceEvidence?: string[];
  matches?: RankedOpportunityCard[];
  programs?: ProgramContextRecord[];
  historicalAwards?: HistoricalAwardRecord[];
  sourceSummaries?: SourceSearchSummary[];
  durableWorkspace?: WorkspaceClientCredentials;
  savedOpportunityIds?: string[];
}

function profileFromText(text: string): CompanyProfile {
  return {
    ...EMPTY_PROFILE,
    ...createEvidenceOnlyFounderProfile(text),
  };
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
  const label = stage === "intake" ? "Add your information" : "Confirm your profile";
  return (
    <div className="flex items-center gap-3 text-sm font-semibold text-[#68778b]" aria-label="Profile progress">
      <span>Step 1 of 3</span>
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
    <header className="sticky top-0 z-30 border-b border-[#0a1930]/10 bg-[#f5f8fc]/92 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-8 lg:px-12">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#06275c] text-xs font-black tracking-[-0.04em] text-white shadow-[0_8px_24px_rgba(23,61,44,0.18)]">GR</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-[-0.02em]">Government Resource Finder</p>
            <p className="hidden text-[11px] text-[#68778b] sm:block">Clear routes for startup funding</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span aria-live="polite" className="sr-only">{saveContent.announcement}</span>
          <span aria-hidden="true" className="hidden items-center gap-2 text-xs text-[#68778b] sm:flex" title={saveContent.announcement}>
            <span className={`h-2.5 w-2.5 rounded-full ${saveContent.dotClassName}`} />
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  helper,
  type = "text",
  autoComplete,
  status,
  wide = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  type?: "text" | "email" | "url";
  autoComplete?: string;
  status?: "captured" | "missing";
  wide?: boolean;
  multiline?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const effectiveStatus = status ?? (isSupportedProfileValue(value) ? "captured" : "missing");
  const className =
    "mt-2 min-h-12 w-full rounded-2xl border border-[#0a1930]/12 bg-white px-4 py-3 text-base text-[#0a1930] outline-none transition placeholder:text-[#9ba29d] focus:border-[#0968d8] focus:ring-4 focus:ring-[#0968d8]/10 sm:text-sm";
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <span className="flex items-center justify-between gap-3 text-sm font-semibold text-[#36475f]">
        <span>{label}</span>
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${effectiveStatus === "captured" ? "bg-[#dff2e4] text-[#205d3a]" : "bg-[#fff1ce] text-[#735511]"}`}>
            {effectiveStatus === "captured" ? "What we know" : "Still unknown"}
          </span>
          <button
            type="button"
            aria-label={`Edit ${label}`}
            onClick={() => (multiline ? textareaRef.current : inputRef.current)?.focus()}
            className="grid h-8 w-8 place-items-center rounded-full border border-[#0a1930]/10 bg-white text-base text-[#084b9a] transition hover:border-[#084b9a]/35"
          >
            ✎
          </button>
        </span>
      </span>
      {multiline ? (
        <textarea
          ref={textareaRef}
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={4}
          className={className}
        />
      ) : (
        <input
          ref={inputRef}
          aria-label={label}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={className}
        />
      )}
      {helper && <span className="mt-2 block text-xs leading-5 text-[#7a847d]">{helper}</span>}
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
      <div className="thinking-orb" aria-hidden="true">
        <span className="thinking-orb-core" />
        <span className="thinking-orb-ring thinking-orb-ring-one" />
        <span className="thinking-orb-ring thinking-orb-ring-two" />
      </div>
      <h1>Finding your strongest routes</h1>
      <p>Searching current opportunities and checking fit…</p>
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
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#084b9a]">Before you leave Opportunity Map</p>
        <h2 id="external-source-heading" className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Confirm this is still the right route.</h2>
        <p id="external-source-description" className="mt-3 text-sm leading-6 text-[#5f6f84]">
          You are about to open <strong>{prompt.title}</strong> on an external official site. Opportunity Map currently labels this record as <strong>{prompt.context}</strong>.
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
  const [externalProcessingConsent, setExternalProcessingConsent] =
    useState(false);
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
  const [reviewMode, setReviewMode] = useState<"questions" | "confirm">("confirm");
  const [reviewQuestionKeys, setReviewQuestionKeys] = useState<Array<keyof CompanyProfile>>([]);
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

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const stored = window.localStorage.getItem(STORAGE_KEY);
          if (!stored) return;
          const parsed = JSON.parse(stored) as StoredWorkbenchSnapshot;
          if (parsed.profile) setProfile({ ...EMPTY_PROFILE, ...parsed.profile });
          if (parsed.stage) setStage(parsed.stage);
          const workspace = hydrateWorkspace(
            parsed.workspace ? JSON.stringify(parsed.workspace) : null,
          );
          setSelectedOpportunityId(workspace.selectedOpportunityId);
          setChecklistByOpportunity(workspace.checklistByOpportunity);
          if (parsed.sourceEvidence) setSourceEvidence(parsed.sourceEvidence);
          if (parsed.matches) setMatches(parsed.matches);
          if (parsed.programs) setPrograms(parsed.programs);
          if (parsed.historicalAwards) {
            setHistoricalAwards(parsed.historicalAwards);
          }
          if (parsed.sourceSummaries) {
            setSourceSummaries(parsed.sourceSummaries);
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
            setProfile((current) => ({
              ...current,
              founderName: remote.founderContact.name,
              founderRole: remote.founderContact.role,
              founderEmail: remote.founderContact.email,
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
        stage,
        profile,
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
    programs,
    selectedOpportunityId,
    sourceEvidence,
    sourceSummaries,
    savedOpportunityIds,
    stage,
  ]);

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
  const founderContactFields = [
    { key: "founderName" as const, label: "Founder name" },
    { key: "founderRole" as const, label: "Founder role" },
    { key: "founderEmail" as const, label: "Founder email" },
  ];
  const missingFounderContact = founderContactFields.filter(
    ({ key }) => !isSupportedProfileField(key, profile[key]),
  );
  const applicationFieldStatus = selectedOpportunity?.applicationFields.map((field) => {
    const value = field.profileKey ? profile[field.profileKey] : "";
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
  const currentReviewQuestion = REQUIRED_REVIEW_QUESTIONS.find(
    ({ key }) => key === currentReviewQuestionKey,
  );

  function openProfileReview() {
    setReviewMode("confirm");
    setStage("review");
  }

  function resetWorkspace() {
    window.localStorage.removeItem(STORAGE_KEY);
    setStage("intake");
    setProfile(EMPTY_PROFILE);
    setExternalProcessingConsent(false);
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
    setReviewMode("confirm");
    setReviewQuestionKeys([]);
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
    if (!externalProcessingConsent) {
      setIntakeStatus("error");
      setIntakeMessage("Consent is required before supplied evidence is sent to OpenAI.");
      return;
    }
    const hasWebsite = websiteUrl.trim().length > 0;
    const hasEvidence = manualText.trim().length >= 35;
    if (!hasWebsite && !hasEvidence) {
      setIntakeStatus("error");
      setIntakeMessage("Add a public website or a few sentences about the company before continuing.");
      return;
    }
    setIntakeStatus("loading");
    setIntakeMessage("");
    try {
      let nextProfile: CompanyProfile = { ...EMPTY_PROFILE };
      const nextEvidence: string[] = [];
      const messages: string[] = [];

      if (hasWebsite) {
        const response = await fetch("/api/intake/website", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: websiteUrl.trim(),
            externalProcessingConsent: true,
          }),
        });
        const result = (await response.json()) as WebsiteResponse;
        if (!response.ok || !result.profile) {
          throw new Error(result.error ?? result.fallback ?? "Website review failed.");
        }
        nextProfile = {
          ...nextProfile,
          ...pickSupportedEvidenceProfile(result.profile),
          website: websiteUrl.trim(),
        };
        nextEvidence.push(...(result.evidence ?? []).map((item) =>
          `${item.field}: extracted from ${new URL(item.sourceUrl).hostname}`));
        messages.push(intakeResultMessage(result));
      }

      if (hasEvidence) {
        const sourceType = uploadedFiles.some((file) => file.kind === "pdf") ? "pdf" : "manual";
        const response = await fetch("/api/intake/evidence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceType,
            evidenceText: manualText.trim(),
            externalProcessingConsent: true,
          }),
        });
        const result = (await response.json()) as EvidenceResponse;
        if (!response.ok || !result.profile) {
          throw new Error(result.error ?? result.fallback ?? "Evidence review failed.");
        }
        nextProfile = {
          ...nextProfile,
          ...profileFromText(manualText.trim()),
          ...pickSupportedEvidenceProfile(result.profile),
          website: nextProfile.website || websiteUrl.trim(),
        };
        nextEvidence.push(...(result.evidence?.length
          ? result.evidence.map((item) => `${item.field}: supported by submitted evidence.`)
          : ["Company description: provided by the founder."]));
        messages.push(intakeResultMessage(result));
      }

      const confirmedCandidate: CompanyProfile = {
        ...nextProfile,
        applicantType: nextProfile.applicantType || "Unknown — founder input needed",
        ownership: nextProfile.ownership || "Unknown — founder input needed",
        samStatus: nextProfile.samStatus || "Unknown",
      };
      const missingQuestionKeys = REQUIRED_REVIEW_QUESTIONS
        .filter(({ key }) => !isSupportedProfileValue(confirmedCandidate[key]))
        .map(({ key }) => key);
      setProfile(confirmedCandidate);
      setReviewQuestionKeys(missingQuestionKeys);
      setReviewQuestionIndex(0);
      setReviewMode(missingQuestionKeys.length ? "questions" : "confirm");
      setMatches([]);
      setPrograms([]);
      setHistoricalAwards([]);
      setSourceSummaries([]);
      setSourceEvidence(nextEvidence);
      setIntakeStatus("idle");
      setIntakeMessage(messages[0] ?? "Review the extracted profile before searching.");
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

  async function handleDocuments(event: ChangeEvent<HTMLInputElement>) {
    const selected = [...(event.target.files ?? [])];
    if (!selected.length) return;
    const room = Math.max(0, 5 - uploadedFiles.length);
    const accepted = selected.slice(0, room);
    if (selected.length > room) setDocumentMessage("You can upload up to 5 files.");

    const nextFiles: UploadedFile[] = [];
    const extractedSnippets: string[] = [];
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
      let extraction: UploadedFile["extraction"] = "paste-needed";
      if (extension === "pdf") {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const raw = new TextDecoder("latin1").decode(bytes);
        const snippets = [...raw.matchAll(/\(([^()]{20,})\)\s*Tj/g)]
          .map((match) => match[1].replace(/\\[nrt]/g, " ").replace(/\\([()\\])/g, "$1"))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (snippets.length > 80) {
          extraction = "read";
          extractedSnippets.push(snippets.slice(0, 5_000));
        }
      }
      nextFiles.push({ name: file.name, size: file.size, kind: extension, extraction });
    }
    setUploadedFiles((current) => [...current, ...nextFiles].slice(0, 5));
    if (extractedSnippets.length) {
      setManualText((current) => [current, ...extractedSnippets].filter(Boolean).join("\n\n").slice(0, 12_000));
      setDocumentMessage("Readable PDF text was added below. Review it before continuing.");
    } else if (nextFiles.length) {
      setDocumentMessage("Files attached. Paste their readable company text below if it was not extracted.");
    }
    event.target.value = "";
  }

  function updateProfile(key: keyof CompanyProfile, value: string) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function buildMap() {
    const confirmedProfile = profile;
    setProfile(confirmedProfile);
    setSearchStatus("loading");
    setSelectedOpportunityId("");
    setGrantsHealth({ status: "checking", message: "Searching Grants.gov for current opportunities…" });
    setSpendingHealth({ status: "checking", message: "Searching historical award sources…" });
    try {
      const response = await fetch("/api/opportunities/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: confirmedProfile }),
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
      setStage("results");
    }
  }

  function openWorkspace(opportunity: OpportunityCard) {
    setSelectedOpportunityId(opportunity.id);
    setStage("workspace");
  }

  return (
    <main className="app-shell min-h-screen overflow-x-hidden text-[#0a1930]">
      <AppHeader onReset={resetWorkspace} saveMode={saveMode} />
      <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-8 sm:pb-20 sm:pt-7 lg:px-12">
        <StepRail stage={stage} />

        {stage === "intake" && (
          <section className="pt-10 lg:pt-14">
            <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
              <div className="lg:sticky lg:top-28">
                <h1 className="max-w-xl text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.05em] sm:text-5xl">
                  Find the right government resources for your startup.
                </h1>
                <p className="mt-5 max-w-xl text-base leading-7 text-[#5f6f84]">
                  Add what you already have. We’ll turn it into a profile, ask only what is missing, and show the strongest defensible routes.
                </p>

                <div className="mt-8 max-w-xl border-l-2 border-[#06275c]/20 pl-5">
                  <ul className="grid gap-3 text-sm leading-6 text-[#5f6f84]">
                    <li>Official sources stay attached to every result.</li>
                    <li>Unknown facts stay unknown until you confirm them.</li>
                    <li>Historical awards never appear as open funding.</li>
                  </ul>
                </div>
              </div>

              <div className="rounded-[2rem] border border-[#0a1930]/10 bg-white/80 p-5 shadow-[0_22px_70px_rgba(23,33,27,0.08)] sm:p-7">
                <form onSubmit={continueIntake}>
                  <label htmlFor="website-url" className="block text-sm font-bold text-[#36475f]">Company website</label>
                  <input
                    id="website-url"
                    type="url"
                    value={websiteUrl}
                    onChange={(event) => setWebsiteUrl(event.target.value)}
                    placeholder="https://yourcompany.com"
                    className="mt-2 w-full rounded-xl border border-[#0a1930]/12 bg-white px-4 py-3.5 text-base outline-none transition focus:border-[#0968d8] focus:ring-4 focus:ring-[#0968d8]/10"
                  />

                  <div className="mt-5">
                    <label className="grid cursor-pointer place-items-center rounded-xl border border-dashed border-[#0968d8]/35 bg-[#f5f8fc] px-5 py-6 text-center transition hover:border-[#0968d8]">
                      <input
                        type="file"
                        multiple
                        accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx"
                        className="sr-only"
                        onChange={handleDocuments}
                        disabled={uploadedFiles.length >= 5}
                      />
                      <span className="text-sm font-bold">Add PDF, Word, or PowerPoint files</span>
                      <span className="mt-1 text-xs text-[#718095]">Up to 5 files, 10 MB each</span>
                    </label>
                    {uploadedFiles.length > 0 && (
                      <ul className="mt-3 grid gap-2" aria-label="Attached files">
                        {uploadedFiles.map((file) => (
                          <li key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-xl border border-[#0a1930]/8 bg-white px-3 py-2 text-sm">
                            <span className="min-w-0 truncate"><strong>{file.name}</strong> <span className="text-[#718095]">· {file.extraction === "read" ? "text ready" : "paste text below"}</span></span>
                            <button type="button" onClick={() => setUploadedFiles((current) => current.filter((item) => item !== file))} className="shrink-0 text-xs font-bold text-[#5e6c80]">Remove</button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {documentMessage && <p className="mt-2 text-xs leading-5 text-[#68778b]">{documentMessage}</p>}
                  </div>

                  <label htmlFor="manual-summary" className="mt-5 block text-sm font-bold text-[#36475f]">Anything else we should know?</label>
                  <textarea
                    id="manual-summary"
                    value={manualText}
                    onChange={(event) => setManualText(event.target.value)}
                    rows={5}
                    placeholder="Describe the product, customers, location, project, and what funding would support."
                    className="mt-2 w-full rounded-xl border border-[#0a1930]/12 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-[#0968d8] focus:ring-4 focus:ring-[#0968d8]/10"
                  />

                  <details className="mt-5 rounded-xl border border-[#0a1930]/10 bg-[#f8fafd] px-4 py-3 text-sm">
                    <summary className="cursor-pointer font-bold text-[#36475f]">How your information is processed</summary>
                    <p className="mt-2 text-xs leading-5 text-[#66758a]">{EXTERNAL_PROCESSING_DISCLOSURE}</p>
                    <label className="mt-3 flex cursor-pointer items-start gap-3 text-xs font-semibold leading-5">
                      <input
                        type="checkbox"
                        checked={externalProcessingConsent}
                        onChange={(event) => {
                          setExternalProcessingConsent(event.target.checked);
                          setIntakeMessage("");
                        }}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-[#0968d8]"
                      />
                      <span>I consent to this processing for the evidence I submit.</span>
                    </label>
                  </details>

                  <button
                    type="submit"
                    disabled={!externalProcessingConsent || intakeStatus === "loading"}
                    className="mt-5 w-full rounded-xl bg-[#06275c] px-5 py-4 text-sm font-bold text-white transition hover:bg-[#084b9a] disabled:cursor-wait disabled:opacity-65"
                  >
                    {intakeStatus === "loading" ? "Building your profile…" : "Continue"}
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

        {stage === "review" && searchStatus !== "loading" && reviewMode === "questions" && currentReviewQuestion && (
          <section className="mx-auto max-w-2xl pt-12 sm:pt-16">
            <p className="text-sm font-semibold text-[#68778b]">{reviewQuestionIndex + 1} of {reviewQuestionKeys.length}</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">{currentReviewQuestion.label}</h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-[#5f6f84]">{currentReviewQuestion.why}</p>
            <div className="mt-8 rounded-2xl border border-[#0a1930]/10 bg-white p-5 shadow-[0_18px_50px_rgba(6,39,92,0.06)] sm:p-7">
              <Field
                label={currentReviewQuestion.label}
                value={String(profile[currentReviewQuestion.key] ?? "")}
                onChange={(value) => updateProfile(currentReviewQuestion.key, value)}
                placeholder={currentReviewQuestion.placeholder}
                multiline={currentReviewQuestion.multiline}
                status={isSupportedProfileValue(profile[currentReviewQuestion.key]) ? "captured" : "missing"}
              />
              <div className="mt-6 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => reviewQuestionIndex > 0 ? setReviewQuestionIndex((index) => index - 1) : setStage("intake")}
                  className="min-h-11 rounded-xl border border-[#0a1930]/12 bg-white px-5 py-3 text-sm font-bold text-[#06275c]"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!isSupportedProfileValue(profile[currentReviewQuestion.key])}
                  onClick={() => {
                    if (reviewQuestionIndex === reviewQuestionKeys.length - 1) setReviewMode("confirm");
                    else setReviewQuestionIndex((index) => index + 1);
                  }}
                  className="min-h-11 rounded-xl bg-[#06275c] px-6 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </div>
          </section>
        )}

        {stage === "review" && searchStatus !== "loading" && reviewMode === "confirm" && (
          <section className="pt-10">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Confirm your profile.</h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-[#5f6f84]">Unknown fields stay unknown. They can lower confidence, but the system will not guess.</p>
              </div>
              <button type="button" onClick={() => setStage("intake")} className="w-fit rounded-full border border-[#0a1930]/12 bg-white px-4 py-2.5 text-sm font-semibold">
                Change intake
              </button>
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
              <div className="space-y-5">
                <section aria-labelledby="founder-contact-heading" className="rounded-[2rem] border border-[#7eb08e]/25 bg-[#edf5ef] p-5 shadow-[0_20px_65px_rgba(23,33,27,0.05)] sm:p-7">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h2 id="founder-contact-heading" className="text-2xl font-semibold tracking-[-0.035em]">What you added</h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5f6f84]">Values already found in intake evidence stay filled. We ask only for contact details that are still missing.</p>
                    </div>
                    <span className={`w-fit shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${missingFounderContact.length ? "bg-[#fff1ce] text-[#735511]" : "bg-[#dff2e4] text-[#205d3a]"}`}>
                      {missingFounderContact.length ? `${missingFounderContact.length} missing` : "Contact ready"}
                    </span>
                  </div>
                  <div className="mt-6 grid gap-5 md:grid-cols-3">
                    <Field
                      label="Founder name"
                      value={profile.founderName ?? ""}
                      onChange={(value) => updateProfile("founderName", value)}
                      placeholder="Full name"
                      autoComplete="name"
                      status={isSupportedProfileValue(profile.founderName) ? "captured" : "missing"}
                    />
                    <Field
                      label="Role"
                      value={profile.founderRole ?? ""}
                      onChange={(value) => updateProfile("founderRole", value)}
                      placeholder="CEO, founder, grants lead…"
                      autoComplete="organization-title"
                      status={isSupportedProfileValue(profile.founderRole) ? "captured" : "missing"}
                    />
                    <Field
                      label="Email"
                      value={profile.founderEmail ?? ""}
                      onChange={(value) => updateProfile("founderEmail", value)}
                      placeholder="name@company.com"
                      type="email"
                      autoComplete="email"
                      status={isSupportedProfileField("founderEmail", profile.founderEmail) ? "captured" : "missing"}
                    />
                  </div>
                </section>

                <section aria-labelledby="company-profile-heading" className="rounded-[2rem] border border-[#0a1930]/10 bg-white/85 p-5 shadow-[0_20px_65px_rgba(23,33,27,0.06)] sm:p-7">
                  <div className="mb-6">
                    <h2 id="company-profile-heading" className="text-2xl font-semibold tracking-[-0.035em]">What we know</h2>
                    <p className="mt-2 text-sm leading-6 text-[#5f6f84]">Use the edit icon beside any value to change only that field.</p>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Company name" value={profile.companyName} onChange={(value) => updateProfile("companyName", value)} placeholder="Legal or public name" autoComplete="organization" />
                    <Field label="Website" value={profile.website} onChange={(value) => updateProfile("website", value)} placeholder="https://…" type="url" autoComplete="url" />
                    <Field wide multiline label="What the company does" value={profile.description} onChange={(value) => updateProfile("description", value)} />
                    <Field label="Industry" value={profile.industry} onChange={(value) => updateProfile("industry", value)} />
                    <Field label="Technology" value={profile.technology} onChange={(value) => updateProfile("technology", value)} />
                    <Field label="Location" value={profile.location} onChange={(value) => updateProfile("location", value)} placeholder="City, state, country" autoComplete="address-level2" />
                    <Field label="Employees" value={profile.employees} onChange={(value) => updateProfile("employees", value)} />
                    <Field label="Revenue" value={profile.revenue} onChange={(value) => updateProfile("revenue", value)} />
                    <Field label="Capital raised" value={profile.capitalRaised} onChange={(value) => updateProfile("capitalRaised", value)} />
                    <Field label="Funding need" value={profile.capitalNeed} onChange={(value) => updateProfile("capitalNeed", value)} />
                    <Field wide multiline label="Use of funds" value={profile.useOfFunds} onChange={(value) => updateProfile("useOfFunds", value)} />
                    <Field label="Target customers" value={profile.customers} onChange={(value) => updateProfile("customers", value)} />
                    <Field label="R&D activities" value={profile.researchActivities} onChange={(value) => updateProfile("researchActivities", value)} />
                    <Field label="Applicant type" value={profile.applicantType} onChange={(value) => updateProfile("applicantType", value)} />
                    <Field label="Ownership" value={profile.ownership} onChange={(value) => updateProfile("ownership", value)} placeholder="Unknown is acceptable" />
                    <Field label="SAM.gov status" value={profile.samStatus} onChange={(value) => updateProfile("samStatus", value)} />
                    <Field label="UEI" value={profile.uei} onChange={(value) => updateProfile("uei", value)} placeholder="Leave blank if unknown" />
                  </div>
                </section>
              </div>

              <aside className="space-y-4 xl:sticky xl:top-24">
                <div className="rounded-[1.75rem] border border-[#0a1930]/10 bg-[#06275c] p-6 text-white">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#acd8ba]">Profile provenance</p>
                  <ul className="mt-5 grid gap-3 text-sm leading-6 text-white/85">
                    {sourceEvidence.length ? sourceEvidence.map((item) => <li key={item}>{item}</li>) : <li>No source recorded yet.</li>}
                    <li>All fields remain editable and require founder confirmation.</li>
                  </ul>
                </div>
                <div className={`rounded-[1.75rem] border p-6 ${missingFounderContact.length ? "border-[#d9b45f]/35 bg-[#fff7e5]" : "border-[#8fc59f]/40 bg-[#edf7ef]"}`}>
                  <p className={`text-xs font-bold uppercase tracking-[0.16em] ${missingFounderContact.length ? "text-[#795c19]" : "text-[#084b9a]"}`}>Workspace contact</p>
                  {missingFounderContact.length ? (
                    <>
                      <p className="mt-3 text-sm leading-6 text-[#6c5a2d]">Add only the contact details the intake evidence did not provide:</p>
                      <ul className="mt-3 grid gap-2 text-sm font-semibold text-[#6c5a2d]">
                        {missingFounderContact.map((field) => <li key={field.key}>• {field.label}</li>)}
                      </ul>
                    </>
                  ) : (
                    <p className="mt-3 text-sm font-semibold leading-6 text-[#084b9a]">Founder contact is ready for source-backed application prefill.</p>
                  )}
                </div>
                <div className="rounded-[1.75rem] border border-[#d9b45f]/35 bg-[#fff7e5] p-6">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#795c19]">Critical unknowns</p>
                  <ul className="mt-4 grid gap-2 text-sm leading-6 text-[#6c5a2d]">
                    {(!profile.ownership || profile.ownership.toLowerCase().includes("unknown")) && <li>Ownership and control</li>}
                    {(!profile.samStatus || profile.samStatus.toLowerCase().includes("unknown")) && <li>SAM.gov registration</li>}
                    {!profile.uei && <li>Unique Entity ID</li>}
                    <li>Exact notice-specific eligibility</li>
                  </ul>
                </div>
                <button
                  type="button"
                  onClick={() => void buildMap()}
                  className="min-h-14 w-full rounded-2xl bg-[#06275c] px-5 py-4 text-sm font-bold text-white shadow-[0_16px_35px_rgba(23,61,44,0.18)] transition hover:bg-[#084b9a] disabled:cursor-wait disabled:opacity-65"
                >
                  Find my resources
                </button>
              </aside>
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
                <h1 className="mt-3 max-w-4xl text-balance text-[2.5rem] font-semibold leading-[1.02] tracking-[-0.05em] sm:text-5xl">Move forward without inventing an answer.</h1>
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
              <button type="button" onClick={() => setStage("results")} className="min-h-11 w-fit rounded-full border border-[#0a1930]/12 bg-white px-4 py-2.5 text-sm font-bold transition hover:border-[#06275c]/30 hover:bg-[#f7f9fc]">Back to opportunity map</button>
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
                          <p className={`text-sm font-semibold leading-6 ${field.known ? "text-[#253d2e]" : "text-[#8a5b1e]"}`}>{field.known ? field.value : "Leave blank until the founder provides it"}</p>
                          <p className="mt-1 text-xs leading-5 text-[#8a938d]">{field.known ? "From the founder-confirmed company profile" : "No supported value is stored"}</p>
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
                  <div className="mt-5 grid gap-3">
                    {INITIAL_CHECKLIST.map((item) => (
                      <label key={item.id} className={`flex min-h-16 cursor-pointer gap-3 rounded-2xl border p-4 transition ${activeChecklist[item.id] ? "border-[#77ae89]/40 bg-[#edf6ef]" : "border-[#0a1930]/10 bg-white hover:border-[#77ae89]/45"}`}>
                        <input type="checkbox" checked={Boolean(activeChecklist[item.id])} onChange={(event) => {
                          if (!selectedOpportunityId) return;
                          setChecklistByOpportunity((current) => setChecklistItem(
                            { version: 2, selectedOpportunityId, checklistByOpportunity: current },
                            selectedOpportunityId,
                            item.id,
                            event.target.checked,
                          ).checklistByOpportunity);
                        }} className="mt-0.5 h-5 w-5 shrink-0 accent-[#0968d8]" />
                        <span><span className={`block text-sm font-bold leading-5 ${activeChecklist[item.id] ? "text-[#084b9a] line-through" : ""}`}>{item.label}</span><span className="mt-1 block text-xs leading-5 text-[#718095]">{item.detail}</span></span>
                      </label>
                    ))}
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

        <footer className="mt-16 flex flex-col gap-2 border-t border-[#0a1930]/10 pt-5 text-xs text-[#68736c] sm:flex-row sm:items-center sm:justify-between">
          <p>Research aid only. Verify eligibility and instructions on the official source.</p>
          <p>Current opportunities, program routes, and historical awards are labeled separately.</p>
        </footer>
      </div>
    </main>
  );
}
