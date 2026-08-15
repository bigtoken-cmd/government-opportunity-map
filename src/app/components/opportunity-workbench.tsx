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

type Stage = "intake" | "review" | "results" | "workspace";
type IntakeMethod = "website" | "document" | "manual";
type FitTier = "Likely Fit" | "Potential Fit" | "Adjacent";
type Decision = "Pursue now" | "Verify first" | "Partner-dependent" | "Watch" | "Skip";
type SaveMode = "saving" | "device-only" | "durable";

type CompanyProfile = {
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

type RankedOpportunityCard = OpportunityCard & {
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
const PROGRAM_SNAPSHOT_LABELS: Record<
  ProgramContextRecord["source"]["snapshotStatus"],
  string
> = {
  live: "Live official program record",
  cached_official_snapshot: "Official cached program record",
  cached_demo_snapshot: "Audited fallback program record",
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
  const activeIndex = stage === "intake" ? 0 : stage === "review" ? 0 : stage === "results" ? 1 : 2;
  const steps = ["Verified profile", "Opportunity map", "Application workspace"];
  return (
    <ol className="grid gap-2 sm:grid-cols-3" aria-label="Progress">
      {steps.map((step, index) => (
        <li
          key={step}
          aria-current={index === activeIndex ? "step" : undefined}
          className={`flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-3 text-sm sm:px-4 ${
            index === activeIndex
              ? "border-[#235f40] bg-[#e7f2e9] text-[#173d2c]"
              : index < activeIndex
                ? "border-[#bad3c2] bg-white text-[#315d43]"
                : "border-[#17211b]/10 bg-white/55 text-[#717b74]"
          }`}
        >
          <span
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
              index <= activeIndex ? "bg-[#173d2c] text-white" : "bg-[#e8e8e2] text-[#6d756f]"
            }`}
          >
            {index < activeIndex ? "✓" : index + 1}
          </span>
          <span className="font-semibold">{step}</span>
        </li>
      ))}
    </ol>
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
    <header className="sticky top-0 z-30 border-b border-[#17211b]/10 bg-[#f4f2eb]/92 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-8 lg:px-12">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#173d2c] text-xs font-black tracking-[-0.04em] text-white shadow-[0_8px_24px_rgba(23,61,44,0.18)]">OM</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-[-0.02em]">Opportunity Map</p>
            <p className="hidden text-[11px] text-[#667169] sm:block">Founder-first government intelligence</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span aria-live="polite" className="sr-only">{saveContent.announcement}</span>
          <span aria-hidden="true" className="hidden items-center gap-2 text-xs text-[#667169] sm:flex" title={saveContent.announcement}>
            <span className={`h-2.5 w-2.5 rounded-full ${saveContent.dotClassName}`} />
            {saveContent.label}
          </span>
          <button
            type="button"
            onClick={onReset}
            className="min-h-10 rounded-full border border-[#17211b]/12 bg-white px-3.5 py-2 text-xs font-bold transition hover:border-[#173d2c]/35 hover:bg-[#f9faf7] sm:px-4"
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
  const className =
    "mt-2 min-h-12 w-full rounded-2xl border border-[#17211b]/12 bg-white px-4 py-3 text-base text-[#17211b] outline-none transition placeholder:text-[#9ba29d] focus:border-[#3f7d59] focus:ring-4 focus:ring-[#3f7d59]/10 sm:text-sm";
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#657168]">
        {label}
        <span aria-hidden="true" className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold normal-case tracking-normal ${status === "captured" ? "bg-[#dff2e4] text-[#205d3a]" : status === "missing" ? "bg-[#fff1ce] text-[#735511]" : "text-[#8a938d]"}`}>
          {status === "captured" ? "Captured" : status === "missing" ? "Missing" : "Founder confirms"}
        </span>
      </span>
      {multiline ? (
        <textarea
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
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
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={className}
        />
      )}
      {helper && <span className="mt-2 block text-xs leading-5 text-[#7a847d]">{helper}</span>}
    </label>
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

export default function OpportunityWorkbench() {
  const [stage, setStage] = useState<Stage>("intake");
  const [method, setMethod] = useState<IntakeMethod>("website");
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [externalProcessingConsent, setExternalProcessingConsent] =
    useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [manualText, setManualText] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [documentMessage, setDocumentMessage] = useState("");
  const [sourceEvidence, setSourceEvidence] = useState<string[]>([]);
  const [intakeStatus, setIntakeStatus] = useState<"idle" | "loading" | "error">("idle");
  const [intakeMessage, setIntakeMessage] = useState("");
  const [selectedOpportunityId, setSelectedOpportunityId] = useState("");
  const [checklistByOpportunity, setChecklistByOpportunity] = useState<WorkspaceState["checklistByOpportunity"]>({});
  const [hydrated, setHydrated] = useState(false);
  const [grantsHealth, setGrantsHealth] = useState<SourceHealth>({ status: "idle", message: "" });
  const [spendingHealth, setSpendingHealth] = useState<SourceHealth>({ status: "idle", message: "" });
  const [matches, setMatches] = useState<RankedOpportunityCard[]>([]);
  const [programs, setPrograms] = useState<ProgramContextRecord[]>([]);
  const [historicalAwards, setHistoricalAwards] = useState<HistoricalAwardRecord[]>([]);
  const [sourceSummaries, setSourceSummaries] = useState<SourceSearchSummary[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error">("idle");
  const [durableCredentials, setDurableCredentials] =
    useState<WorkspaceClientCredentials | null>(null);
  const [durableUnavailable, setDurableUnavailable] = useState(false);
  const [durableSaved, setDurableSaved] = useState(false);
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

  const currentNoticeCount = matches.filter((item) => item.sourceKind !== "Program route").length;
  const persistedGrantsSummary = sourceSummaries.find((source) => source.family === "grants");
  const persistedSpendingSummary = sourceSummaries.find((source) => source.family === "usaspending");
  const effectiveGrantsHealth: SourceHealth = grantsHealth.status === "idle" && persistedGrantsSummary
    ? { status: persistedGrantsSummary.status, message: sourceSummaryMessage(persistedGrantsSummary) }
    : grantsHealth;
  const effectiveSpendingHealth: SourceHealth = spendingHealth.status === "idle" && persistedSpendingSummary
    ? { status: persistedSpendingSummary.status, message: sourceSummaryMessage(persistedSpendingSummary) }
    : spendingHealth;
  const selectedOpportunity =
    matches.find((item) => item.id === selectedOpportunityId) ??
    matches[0] ??
    null;
  const historicalAward = historicalAwards[0] ?? null;
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

  function resetWorkspace() {
    window.localStorage.removeItem(STORAGE_KEY);
    setStage("intake");
    setProfile(EMPTY_PROFILE);
    setExternalProcessingConsent(false);
    setWebsiteUrl("");
    setManualText("");
    setDocumentName("");
    setDocumentMessage("");
    setSourceEvidence([]);
    setSelectedOpportunityId("");
    setChecklistByOpportunity({});
    setIntakeMessage("");
    setMatches([]);
    setPrograms([]);
    setHistoricalAwards([]);
    setSourceSummaries([]);
    setSearchStatus("idle");
    setGrantsHealth({ status: "idle", message: "" });
    setSpendingHealth({ status: "idle", message: "" });
    durableCredentialsRef.current = null;
    setDurableCredentials(null);
    durableUnavailableRef.current = false;
    setDurableUnavailable(false);
    durableGenerationRef.current += 1;
    lastSyncedPayloadRef.current = "";
    setDurableSaved(false);
  }

  async function analyzeWebsite(event: FormEvent) {
    event.preventDefault();
    if (!externalProcessingConsent) {
      setIntakeStatus("error");
      setIntakeMessage("Consent is required before supplied evidence is sent to OpenAI.");
      return;
    }
    setIntakeStatus("loading");
    setIntakeMessage("");
    try {
      const response = await fetch("/api/intake/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: websiteUrl,
          externalProcessingConsent: true,
        }),
      });
      const result = (await response.json()) as WebsiteResponse;
      if (!response.ok || !result.profile) throw new Error(result.error ?? result.fallback ?? "Website review failed.");
      const suggestions = pickSupportedEvidenceProfile(result.profile);
      const website = result.profile
        && typeof result.profile === "object"
        && !Array.isArray(result.profile)
        && typeof (result.profile as Record<string, unknown>).website === "string"
        ? String((result.profile as Record<string, unknown>).website)
        : websiteUrl.trim();
      const nextProfile: CompanyProfile = {
        ...EMPTY_PROFILE,
        ...suggestions,
        website,
        applicantType: "Unknown — founder input needed",
        ownership: "Unknown — founder input needed",
        samStatus: "Unknown",
      };
      setProfile(nextProfile);
      setMatches([]);
      setPrograms([]);
      setHistoricalAwards([]);
      setSourceSummaries([]);
      setSourceEvidence(
        (result.evidence ?? []).map((item) => `${item.field}: extracted from ${new URL(item.sourceUrl).hostname}`),
      );
      setIntakeMessage(intakeResultMessage(result));
      setStage("review");
      setIntakeStatus("idle");
    } catch (error) {
      setIntakeStatus("error");
      setIntakeMessage(error instanceof Error ? error.message : "Use the manual description instead.");
    }
  }

  async function submitEvidence(event: FormEvent) {
    event.preventDefault();
    if (!externalProcessingConsent) {
      setIntakeStatus("error");
      setIntakeMessage("Consent is required before supplied evidence is sent to OpenAI.");
      return;
    }
    if (manualText.trim().length < 35) {
      setIntakeStatus("error");
      setIntakeMessage("Add a few sentences about the product, customers, location, and planned use of funds.");
      return;
    }
    setIntakeStatus("loading");
    setIntakeMessage("");
    const sourceType = method === "document" ? "pdf" : "manual";
    try {
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
        throw new Error(
          result.error ?? result.fallback ?? "Evidence review failed.",
        );
      }
      setProfile({
        ...profileFromText(manualText.trim()),
        ...pickSupportedEvidenceProfile(result.profile),
      });
      setMatches([]);
      setPrograms([]);
      setHistoricalAwards([]);
      setSourceSummaries([]);
      setSourceEvidence(
        result.evidence?.length
          ? result.evidence.map((item) =>
            `${item.field}: supported by submitted ${sourceType} evidence.`)
          : [`Company description: provided through ${sourceType} evidence.`],
      );
      setIntakeStatus("idle");
      setIntakeMessage(intakeResultMessage(result));
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

  async function handleDocument(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setDocumentMessage("Choose a PDF one-pager.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setDocumentMessage("That PDF is over the 10 MB limit.");
      return;
    }
    setDocumentName(file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const raw = new TextDecoder("latin1").decode(bytes);
    const snippets = [...raw.matchAll(/\(([^()]{20,})\)\s*Tj/g)]
      .map((match) => match[1].replace(/\\[nrt]/g, " ").replace(/\\([()\\])/g, "$1"))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (snippets.length > 80) {
      setManualText(snippets.slice(0, 5_000));
      setDocumentMessage("Readable text was found. Review it below before continuing.");
    } else {
      setDocumentMessage("PDF attached. This file does not expose readable text, so paste its company summary below.");
    }
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
    <main className="app-shell min-h-screen overflow-x-hidden text-[#17211b]">
      <AppHeader onReset={resetWorkspace} saveMode={saveMode} />
      <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-8 sm:pb-20 sm:pt-7 lg:px-12">
        <StepRail stage={stage} />

        {stage === "intake" && (
          <section className="pt-10 lg:pt-14">
            <div className="grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
              <div className="lg:sticky lg:top-28">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#3f7557]">Start with what you already have</p>
                <h1 className="mt-4 max-w-xl text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.05em] sm:text-5xl">
                  Tell us about the company. We’ll ask only what is missing.
                </h1>
                <p className="mt-5 max-w-xl text-base leading-7 text-[#59655e]">
                  Every extracted fact stays editable. Matching rules run only after you confirm the profile.
                </p>

                <div className="mt-8 rounded-[1.75rem] border border-[#173d2c]/10 bg-[#173d2c] p-6 text-white shadow-[0_24px_65px_rgba(23,61,44,0.18)]">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a9d7b8]">What the map will not do</p>
                  <ul className="mt-5 grid gap-3 text-sm text-white/85">
                    <li>It will not call you eligible without official verification.</li>
                    <li>It will not mix historical awards with open opportunities.</li>
                    <li>It will not fill an application field without a known source.</li>
                  </ul>
                </div>
              </div>

              <div className="rounded-[2rem] border border-[#17211b]/10 bg-white/80 p-5 shadow-[0_22px_70px_rgba(23,33,27,0.08)] sm:p-7">
                <div role="group" aria-label="Choose an intake method" className="grid grid-cols-3 gap-1.5 rounded-2xl bg-[#edf0ea] p-1.5 sm:gap-2">
                  {([
                    ["website", "Website"],
                    ["document", "PDF"],
                    ["manual", "Describe it"],
                  ] as Array<[IntakeMethod, string]>).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={method === value}
                      onClick={() => {
                        setMethod(value);
                        setIntakeMessage("");
                      }}
                      className={`min-h-11 rounded-xl px-2 py-2.5 text-xs font-semibold transition sm:px-3 sm:text-sm ${
                        method === value ? "bg-white text-[#173d2c] shadow-sm" : "text-[#6b756e] hover:text-[#2f4d3b]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="mt-5 rounded-2xl border border-[#d5c58f]/55 bg-[#fff9e9] p-4 text-sm leading-6 text-[#66531c]">
                  <p className="font-bold">OpenAI processing disclosure</p>
                  <p className="mt-1 text-xs leading-5">{EXTERNAL_PROCESSING_DISCLOSURE}</p>
                  <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl bg-white/75 px-3 py-3 text-xs font-semibold leading-5">
                    <input
                      type="checkbox"
                      checked={externalProcessingConsent}
                      onChange={(event) => {
                        setExternalProcessingConsent(event.target.checked);
                        setIntakeMessage("");
                      }}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#2f704a]"
                    />
                    <span>I consent to this processing for the evidence I submit.</span>
                  </label>
                </div>

                {method === "website" && (
                  <form onSubmit={analyzeWebsite} className="mt-7">
                    <label htmlFor="website-url" className="text-xs font-bold uppercase tracking-[0.13em] text-[#647067]">Public HTTPS company website</label>
                    <input
                      id="website-url"
                      type="url"
                      required
                      value={websiteUrl}
                      onChange={(event) => setWebsiteUrl(event.target.value)}
                      placeholder="https://yourcompany.com"
                      className="mt-2 w-full rounded-2xl border border-[#17211b]/12 bg-white px-4 py-4 text-base outline-none transition focus:border-[#3f7d59] focus:ring-4 focus:ring-[#3f7d59]/10"
                    />
                    <button
                      type="submit"
                      disabled={!externalProcessingConsent || intakeStatus === "loading"}
                      className="mt-4 w-full rounded-2xl bg-[#173d2c] px-5 py-4 text-sm font-bold text-white transition hover:bg-[#214f39] disabled:cursor-wait disabled:opacity-65"
                    >
                      {intakeStatus === "loading" ? "Reviewing public website…" : "Build a reviewable profile"}
                    </button>
                    <p className="mt-3 text-xs leading-5 text-[#778078]">Public page text only. Private pages, logins, and non-HTTPS addresses are blocked.</p>
                  </form>
                )}

                {method === "document" && (
                  <div className="mt-7">
                    <label className="grid cursor-pointer place-items-center rounded-[1.5rem] border border-dashed border-[#3f7557]/40 bg-[#f5f8f3] px-6 py-10 text-center transition hover:border-[#3f7557]">
                      <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={handleDocument} />
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-[#dff2e4] text-xl font-semibold text-[#205d3a]">+</span>
                      <span className="mt-4 text-sm font-bold">Choose one PDF one-pager</span>
                      <span className="mt-1 text-xs text-[#748077]">Up to 10 MB. Only extracted or pasted text is sent; the PDF binary stays in this browser.</span>
                    </label>
                    {documentName && <p className="mt-3 text-sm font-semibold text-[#315d43]">Attached: {documentName}</p>}
                    {documentMessage && <p className="mt-2 text-xs leading-5 text-[#6b756e]">{documentMessage}</p>}
                    <form onSubmit={submitEvidence} className="mt-5">
                      <label htmlFor="document-summary" className="text-xs font-bold uppercase tracking-[0.13em] text-[#647067]">Extracted or pasted company summary</label>
                      <textarea
                        id="document-summary"
                        value={manualText}
                        onChange={(event) => setManualText(event.target.value)}
                        rows={6}
                        placeholder="Paste the one-pager text here if the PDF is image-based."
                        className="mt-2 w-full rounded-2xl border border-[#17211b]/12 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-[#3f7d59] focus:ring-4 focus:ring-[#3f7d59]/10"
                      />
                      <button
                        type="submit"
                        disabled={!externalProcessingConsent || intakeStatus === "loading"}
                        className="mt-4 w-full rounded-2xl bg-[#173d2c] px-5 py-4 text-sm font-bold text-white hover:bg-[#214f39] disabled:cursor-wait disabled:opacity-65"
                      >
                        {intakeStatus === "loading" ? "Reviewing PDF evidence…" : "Review extracted profile"}
                      </button>
                    </form>
                  </div>
                )}

                {method === "manual" && (
                  <form onSubmit={submitEvidence} className="mt-7">
                    <label htmlFor="manual-summary" className="text-xs font-bold uppercase tracking-[0.13em] text-[#647067]">Plain-language company description</label>
                    <textarea
                      id="manual-summary"
                      value={manualText}
                      onChange={(event) => setManualText(event.target.value)}
                      rows={8}
                      placeholder="We’re a Utah company building… We sell to… We need funding for…"
                      className="mt-2 w-full rounded-2xl border border-[#17211b]/12 bg-white px-4 py-4 text-sm leading-6 outline-none focus:border-[#3f7d59] focus:ring-4 focus:ring-[#3f7d59]/10"
                    />
                    <button
                      type="submit"
                      disabled={!externalProcessingConsent || intakeStatus === "loading"}
                      className="mt-4 w-full rounded-2xl bg-[#173d2c] px-5 py-4 text-sm font-bold text-white hover:bg-[#214f39] disabled:cursor-wait disabled:opacity-65"
                    >
                      {intakeStatus === "loading" ? "Reviewing supplied evidence…" : "Turn this into a profile"}
                    </button>
                  </form>
                )}

                {intakeMessage && (
                  <div role={intakeStatus === "error" ? "alert" : "status"} className={`mt-4 rounded-2xl px-4 py-3 text-sm ${intakeStatus === "error" ? "bg-[#fff0e9] text-[#8b3c21]" : "bg-[#edf5ef] text-[#315d43]"}`}>
                    {intakeMessage}
                  </div>
                )}

              </div>
            </div>
          </section>
        )}

        {stage === "review" && (
          <section className="pt-10">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#3f7557]">Founder verification</p>
                <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Confirm the facts before matching.</h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-[#5f6b63]">Unknown fields stay unknown. They can lower confidence, but the system will not guess.</p>
              </div>
              <button type="button" onClick={() => setStage("intake")} className="w-fit rounded-full border border-[#17211b]/12 bg-white px-4 py-2.5 text-sm font-semibold">
                Change intake
              </button>
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
              <div className="space-y-5">
                <section aria-labelledby="founder-contact-heading" className="rounded-[2rem] border border-[#7eb08e]/25 bg-[#edf5ef] p-5 shadow-[0_20px_65px_rgba(23,33,27,0.05)] sm:p-7">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#3f7557]">Application contact</p>
                      <h2 id="founder-contact-heading" className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Who should own the application?</h2>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5f6b63]">Values already found in intake evidence stay filled. We ask only for contact details that are still missing.</p>
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

                <section aria-labelledby="company-profile-heading" className="rounded-[2rem] border border-[#17211b]/10 bg-white/85 p-5 shadow-[0_20px_65px_rgba(23,33,27,0.06)] sm:p-7">
                  <div className="mb-6">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#667169]">Company evidence</p>
                    <h2 id="company-profile-heading" className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Confirm the organization profile</h2>
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
                <div className="rounded-[1.75rem] border border-[#17211b]/10 bg-[#173d2c] p-6 text-white">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#acd8ba]">Profile provenance</p>
                  <ul className="mt-5 grid gap-3 text-sm leading-6 text-white/85">
                    {sourceEvidence.length ? sourceEvidence.map((item) => <li key={item}>{item}</li>) : <li>No source recorded yet.</li>}
                    <li>All fields remain editable and require founder confirmation.</li>
                  </ul>
                </div>
                <div className={`rounded-[1.75rem] border p-6 ${missingFounderContact.length ? "border-[#d9b45f]/35 bg-[#fff7e5]" : "border-[#8fc59f]/40 bg-[#edf7ef]"}`}>
                  <p className={`text-xs font-bold uppercase tracking-[0.16em] ${missingFounderContact.length ? "text-[#795c19]" : "text-[#315d43]"}`}>Workspace contact</p>
                  {missingFounderContact.length ? (
                    <>
                      <p className="mt-3 text-sm leading-6 text-[#6c5a2d]">Add only the contact details the intake evidence did not provide:</p>
                      <ul className="mt-3 grid gap-2 text-sm font-semibold text-[#6c5a2d]">
                        {missingFounderContact.map((field) => <li key={field.key}>• {field.label}</li>)}
                      </ul>
                    </>
                  ) : (
                    <p className="mt-3 text-sm font-semibold leading-6 text-[#315d43]">Founder contact is ready for source-backed application prefill.</p>
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
                  disabled={searchStatus === "loading"}
                  className="min-h-14 w-full rounded-2xl bg-[#173d2c] px-5 py-4 text-sm font-bold text-white shadow-[0_16px_35px_rgba(23,61,44,0.18)] transition hover:bg-[#214f39] disabled:cursor-wait disabled:opacity-65"
                >
                  {searchStatus === "loading" ? "Searching official sources…" : "Confirm profile and build map"}
                </button>
              </aside>
            </div>
          </section>
        )}

        {stage === "results" && (
          <section className="pt-10">
            <div role="status" className={`rounded-[1.5rem] border px-4 py-4 text-sm sm:px-5 ${effectiveGrantsHealth.status === "live" ? "border-[#8fc59f]/55 bg-[#edf7ef] text-[#28583a]" : effectiveGrantsHealth.status === "unavailable" ? "border-[#d79c8d]/45 bg-[#fff1ec] text-[#7b3827]" : "border-[#d5c58f]/50 bg-[#fff9e9] text-[#66531c]"}`}>
              <div className="sm:flex sm:items-center sm:justify-between sm:gap-5">
                <p>
                  <span className="font-bold">Source mode:</span>{" "}
                  {currentNoticeCount
                    ? `${currentNoticeCount} current Grants.gov record${currentNoticeCount === 1 ? "" : "s"} ranked; program definitions and historical awards remain separate.`
                    : "No sourced current opportunity passed the deterministic relevance threshold."}
                </p>
                <span className="mt-2 inline-flex shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold sm:mt-0">
                  {effectiveGrantsHealth.status === "checking"
                    ? "Checking live catalog"
                    : effectiveGrantsHealth.status === "live"
                      ? "Live API validated"
                      : effectiveGrantsHealth.status === "cached-fallback"
                        ? "Official fallback active"
                        : effectiveGrantsHealth.status === "cached"
                          ? "Official snapshot"
                          : effectiveGrantsHealth.status === "unavailable"
                            ? "Source unavailable"
                            : "Source status pending"}
                </span>
              </div>
              {effectiveGrantsHealth.message && <p className="mt-2 text-xs leading-5 opacity-80">{effectiveGrantsHealth.message}</p>}
              {sourceSummaries.length > 0 && (
                <p className="mt-2 text-xs leading-5 opacity-80">
                  Source checks: {sourceSummaries.map((source) => `${source.family} ${source.status} (${source.recordCount})`).join(" · ")}
                </p>
              )}
            </div>

            <div className="mt-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#3f7557]">Government Opportunity Map</p>
                <h1 className="mt-3 max-w-4xl text-balance text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
                  {matches.length ? `${matches.length} route${matches.length === 1 ? "" : "s"} worth a careful look.` : "No strong traditional grant match found."}
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-[#5f6b63]">
                  {matches.length
                    ? "Each route shows its evidence score, source freshness, and remaining verification work before you decide whether to pursue."
                    : "No current or forecasted record cleared the deterministic relevance and eligibility gates for this confirmed profile."}
                </p>
              </div>
              <button type="button" onClick={() => setStage("review")} className="w-fit rounded-full border border-[#17211b]/12 bg-white px-4 py-2.5 text-sm font-semibold">Edit verified profile</button>
            </div>

            {matches.length ? (
              <div className="mt-8 grid gap-5">
                {matches.map((opportunity, index) => (
                  <article key={opportunity.id} className="overflow-hidden rounded-[2rem] border border-[#17211b]/10 bg-white/85 shadow-[0_20px_65px_rgba(23,33,27,0.06)]">
                    <div className="grid lg:grid-cols-[0.68fr_0.32fr]">
                      <div className="p-6 sm:p-8">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[#17211b] px-3 py-1.5 text-xs font-bold text-white">#{index + 1}</span>
                          <DecisionPill decision={opportunity.decision} />
                          <span className="rounded-full bg-[#eef1ed] px-3 py-1.5 text-xs font-semibold text-[#526058]">{opportunity.fitTier}</span>
                          <span className="rounded-full border border-[#17211b]/10 bg-white px-3 py-1.5 text-xs font-semibold text-[#526058]" title="Deterministic evidence score, not an eligibility determination">Evidence {opportunity.score}/100</span>
                        </div>
                        <p className="mt-6 text-xs font-bold uppercase tracking-[0.15em] text-[#47795b]">{opportunity.agency}</p>
                        <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{opportunity.title}</h2>
                        <p className="mt-2 text-sm text-[#69746d]">{opportunity.opportunityNumber}</p>

                        <div className="mt-7 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-2xl bg-[#f2f4ef] p-4"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#788078]">Relationship</p><p className="mt-2 text-sm font-semibold">{opportunity.sourceKind}</p></div>
                          <div className="rounded-2xl bg-[#f2f4ef] p-4"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#788078]">Deadline</p><p className="mt-2 text-sm font-semibold">{opportunity.deadline}</p></div>
                          <div className="rounded-2xl bg-[#f2f4ef] p-4"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#788078]">Potential value</p><p className="mt-2 text-sm font-semibold">{opportunity.amount}</p></div>
                        </div>

                        <div className="mt-7 grid gap-6 md:grid-cols-2">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#2f704a]">Why it may fit</p>
                            <ul className="mt-3 grid gap-2 text-sm leading-6 text-[#536159]">{opportunity.reasons.map((item) => <li key={item} className="flex gap-2"><span className="text-[#3d8a59]">✓</span><span>{item}</span></li>)}</ul>
                          </div>
                          <div>
                            <p className="text-xs font-bold uppercase tracking-[0.13em] text-[#8a5b1e]">What could block it</p>
                            <ul className="mt-3 grid gap-2 text-sm leading-6 text-[#655a49]">{opportunity.concerns.map((item) => <li key={item} className="flex gap-2"><span className="text-[#c38632]">!</span><span>{item}</span></li>)}</ul>
                          </div>
                        </div>
                      </div>

                      <aside className="border-t border-[#17211b]/10 bg-[#173d2c] p-6 text-white lg:border-l lg:border-t-0 sm:p-8">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#acd8ba]">Decision reason</p>
                        <p className="mt-4 text-sm leading-6 text-white/85">{opportunity.relationship}</p>
                        <p className="mt-7 text-xs font-bold uppercase tracking-[0.16em] text-[#acd8ba]">Best next action</p>
                        <p className="mt-3 text-base font-semibold leading-7">{opportunity.nextAction}</p>
                        <div className="mt-8 grid gap-3">
                          <a href={opportunity.sourceUrl} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-center text-sm font-bold hover:bg-white/15">Open official source</a>
                          <button type="button" onClick={() => openWorkspace(opportunity)} className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#173d2c] hover:bg-[#edf6ef]">Prepare application workspace</button>
                        </div>
                        <p className="mt-4 text-xs leading-5 text-white/60">{opportunity.sourceLabel} · Retrieved {opportunity.retrievedAt}</p>
                      </aside>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-8 grid gap-5 lg:grid-cols-[0.65fr_0.35fr]">
                <div className="rounded-[2rem] border border-[#17211b]/10 bg-white/85 p-7 sm:p-9">
                  <span className="inline-flex rounded-full bg-[#e9edef] px-3 py-1.5 text-xs font-bold text-[#43535c]">Honest no-match</span>
                  <h2 className="mt-6 text-3xl font-semibold tracking-[-0.04em]">Do not force a grant-shaped answer.</h2>
                  <p className="mt-4 max-w-2xl text-base leading-7 text-[#5f6b63]">The official records searched did not produce a current route with enough relevant evidence and no disqualifying eligibility result. That is safer than turning a broad keyword into a recommendation.</p>
                  <div className="mt-7 grid gap-3 sm:grid-cols-2">
                    {["Clarify the exact government problem the project solves", "Confirm applicant type, ownership, and registration facts", "Look for government-customer demand in historical awards", "Search again when a specific R&D or public-purpose project exists"].map((item) => <div key={item} className="rounded-2xl bg-[#f2f4ef] p-4 text-sm font-semibold leading-6">{item}</div>)}
                  </div>
                </div>
                <aside className="rounded-[2rem] border border-[#d9b45f]/35 bg-[#fff7e5] p-7">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#795c19]">Why this is useful</p>
                  <p className="mt-4 text-lg font-semibold leading-7 text-[#5f4a18]">It prevents a founder from spending weeks on an application built around a superficial keyword match.</p>
                  <button type="button" onClick={() => setStage("review")} className="mt-7 w-full rounded-2xl border border-[#795c19]/20 bg-white px-4 py-3 text-sm font-bold text-[#5f4a18]">Add a specific R&D project</button>
                </aside>
              </div>
            )}

            <section aria-labelledby="program-context-heading" className="mt-8 rounded-[1.75rem] border border-[#17211b]/10 bg-[#f7f5ee] p-6 sm:p-7">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#667169]">Program context</p>
                  <h2 id="program-context-heading" className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Understand the program behind a notice</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-[#59655e]">Assistance Listings explain a federal program’s purpose. They are background only and are never presented as an open funding opportunity.</p>
                </div>
                <span className="w-fit shrink-0 rounded-full bg-[#fff1ce] px-3 py-1.5 text-xs font-bold text-[#735511]">Not open funding</span>
              </div>
              {programs.length ? (
                <div className="mt-6 grid gap-4">
                  {programs.map((program) => (
                    <article key={program.id} className="rounded-2xl border border-[#17211b]/10 bg-white p-5 sm:p-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#eef1ed] px-3 py-1 text-[11px] font-bold text-[#526058]">ALN {program.assistanceListing}</span>
                        <span className="rounded-full border border-[#17211b]/10 bg-white px-3 py-1 text-[11px] font-bold text-[#526058]">{PROGRAM_SNAPSHOT_LABELS[program.source.snapshotStatus]}</span>
                      </div>
                      <p className="mt-4 text-xs font-bold uppercase tracking-[0.13em] text-[#47795b]">{program.agency}</p>
                      <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{program.title}</h3>
                      <p className="mt-3 text-sm leading-6 text-[#59655e]">{program.objective || "The official source did not provide a program objective."}</p>
                      <div className="mt-5 flex flex-col gap-3 border-t border-[#17211b]/8 pt-4 text-xs text-[#778179] sm:flex-row sm:items-center sm:justify-between">
                        <p>{program.source.sourceName} · Source ID {program.source.sourceId} · Retrieved {displayDate(program.source.retrievedAt)}</p>
                        <a href={program.source.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-[#17211b]/12 bg-white px-4 py-2 font-bold text-[#315d43]">Open official program record</a>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-[#17211b]/8 bg-white px-5 py-4 text-sm leading-6 text-[#59655e]">
                  No supported program-context record is available for this search. No program is being substituted for an open notice.
                </div>
              )}
            </section>

            {historicalAward ? (
              <div className="mt-8 overflow-hidden rounded-[1.75rem] border border-[#17211b]/10 bg-[#eef1ed]">
                <div className="grid lg:grid-cols-[0.7fr_0.3fr]">
                  <div className="p-6 sm:p-7">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#667169]">Historical intelligence</p>
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-[#59655e]">Historical award · not open funding</span>
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold tracking-[-0.035em]">{historicalAward.recipient}</h2>
                    <p className="mt-2 text-sm leading-6 text-[#59655e]">{historicalAward.description || historicalAward.title}</p>
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-white p-4"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#7a837d]">Historical award amount</p><p className="mt-2 text-sm font-bold">{historicalAward.amount ? historicalAward.amount.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "Not reported"}</p></div>
                      <div className="rounded-2xl bg-white p-4"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#7a837d]">Award ID</p><p className="mt-2 text-sm font-bold">{historicalAward.source.sourceId}</p></div>
                      <div className="rounded-2xl bg-white p-4"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#7a837d]">Assistance Listing</p><p className="mt-2 text-sm font-bold">{historicalAward.assistanceListing || "Not provided"}</p></div>
                    </div>
                  </div>
                  <aside className="border-t border-[#17211b]/10 bg-white/70 p-6 lg:border-l lg:border-t-0">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#667169]">What this proves</p>
                    <p className="mt-3 text-sm leading-6 text-[#59655e]">This {historicalAward.source.sourceName} record is historical context only. It is not an open opportunity and does not prove current eligibility.</p>
                    <p className="mt-4 text-xs leading-5 text-[#7a837d]">Period: {displayDate(historicalAward.startDate)} to {displayDate(historicalAward.endDate)}</p>
                    <a href={historicalAward.source.sourceUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex rounded-xl border border-[#17211b]/12 bg-white px-4 py-3 text-sm font-bold text-[#315d43]">Open official award record</a>
                    {effectiveSpendingHealth.message && (
                      <div className="mt-4 rounded-xl border border-[#17211b]/8 bg-white px-3 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#47795b]">
                          {effectiveSpendingHealth.status === "checking" ? "Checking live source" : effectiveSpendingHealth.status === "live" ? "Live API validated" : effectiveSpendingHealth.status === "unavailable" ? "Source unavailable" : "Audited fallback"}
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-[#778179]">{effectiveSpendingHealth.message}</p>
                      </div>
                    )}
                    <p className="mt-3 text-[11px] text-[#8a938d]">Historical record · Retrieved {displayDate(historicalAward.source.retrievedAt)}</p>
                  </aside>
                </div>
              </div>
            ) : (
              <div className="mt-8 rounded-[1.75rem] border border-[#17211b]/10 bg-[#eef1ed] p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#667169]">Historical intelligence</p>
                  <p className="mt-2 text-sm leading-6 text-[#59655e]">No audited historical award is shown for this profile yet. The product will not substitute an unrelated award.</p>
                </div>
                <span className="mt-4 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#59655e] sm:mt-0">No supported insight</span>
              </div>
            )}

            <div className="mt-8 rounded-[1.75rem] border border-[#17211b]/10 bg-white/75 p-6 sm:p-7">
              <div className="grid gap-5 lg:grid-cols-[0.36fr_0.64fr] lg:items-start">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#667169]">Ranking rules</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Evidence first. Eligibility before optimism.</h2>
                </div>
                <div>
                  <p className="text-sm leading-6 text-[#59655e]">Hard applicant restrictions run before ranking. Unknown critical facts cap the result, partner routes require real thematic relevance, and deadlines break ties only. The score is evidence strength, not an eligibility decision.</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold text-[#526058]">
                    {["Mission 25", "Exact terms 20", "Concepts 15", "Technology/R&D 15", "Customer/use 10", "Amount 10", "Geography 5"].map((item) => (
                      <span key={item} className="rounded-full bg-[#eef1ed] px-3 py-1.5">{item}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {stage === "workspace" && selectedOpportunity && (
          <section className="pt-8 sm:pt-10">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#3f7557]">Application workspace</p>
                <h1 className="mt-3 max-w-4xl text-balance text-[2.5rem] font-semibold leading-[1.02] tracking-[-0.05em] sm:text-5xl">Move forward without inventing an answer.</h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-[#5f6b63]">Known facts are organized below and unsupported answers stay visibly blank. Nothing here submits to a government system.</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#edf5ef] px-3 py-1.5 text-xs font-bold text-[#315d43]">{knownApplicationFieldCount} of {applicationFieldStatus.length} prefill fields ready</span>
                  <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#59655e]">{completedCount} of {INITIAL_CHECKLIST.length} tasks complete</span>
                  <span className="rounded-full border border-[#17211b]/10 bg-white/55 px-3 py-1.5 text-xs font-bold text-[#59655e]">
                    {saveMode === "durable"
                      ? "Saved durably"
                      : saveMode === "device-only"
                        ? "Saved privately on this device only"
                        : "Saving privately on this device"}
                  </span>
                </div>
              </div>
              <button type="button" onClick={() => setStage("results")} className="min-h-11 w-fit rounded-full border border-[#17211b]/12 bg-white px-4 py-2.5 text-sm font-bold transition hover:border-[#173d2c]/30 hover:bg-[#f9faf7]">Back to opportunity map</button>
            </div>

            <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
              <div className="space-y-6">
                <div className="overflow-hidden rounded-[2rem] border border-[#17211b]/10 bg-[#173d2c] text-white shadow-[0_24px_70px_rgba(23,61,44,0.16)]">
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
                    <a href={selectedOpportunity.sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#173d2c] transition hover:bg-[#edf6ef] sm:mt-0">Review official instructions</a>
                  </div>
                </div>

                <div className="rounded-[2rem] border border-[#17211b]/10 bg-white/85 p-5 shadow-[0_20px_65px_rgba(23,33,27,0.05)] sm:p-8">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#667169]">Prefill map</p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Known versus missing</h2>
                      <p className="mt-2 text-sm leading-6 text-[#69746d]">Only founder-confirmed values can move into an application draft.</p>
                    </div>
                    <div className="shrink-0 sm:text-right">
                      <p className="text-2xl font-semibold tracking-[-0.04em] text-[#315d43]">{applicationReadinessPercent}%</p>
                      <p className="text-xs font-bold text-[#69746d]">prefill readiness</p>
                    </div>
                  </div>
                  <div role="progressbar" aria-label="Application prefill readiness" aria-valuemin={0} aria-valuemax={100} aria-valuenow={applicationReadinessPercent} className="mt-5 h-2 overflow-hidden rounded-full bg-[#e4e8e2]">
                    <div className="h-full rounded-full bg-[#4c9b67] transition-all" style={{ width: `${applicationReadinessPercent}%` }} />
                  </div>
                  <div className="mt-6 grid gap-3">
                    {applicationFieldStatus.map((field) => (
                      <div key={field.label} className={`grid gap-3 rounded-2xl border p-4 sm:grid-cols-[0.32fr_0.68fr] sm:items-start ${field.known ? "border-[#7eb08e]/25 bg-[#f3f8f4]" : "border-[#d9b45f]/30 bg-[#fffaf0]"}`}>
                        <div className="flex items-center justify-between gap-3 sm:block">
                          <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#748077]">{field.label}</p>
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
                <div className="rounded-[2rem] border border-[#17211b]/10 bg-white/90 p-5 shadow-[0_20px_65px_rgba(23,33,27,0.05)] sm:p-7">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#667169]">Persistent checklist</p>
                      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">{completedCount} of {INITIAL_CHECKLIST.length} complete</h2>
                    </div>
                    <span aria-live="polite" className="text-sm font-bold text-[#315d43]">{Math.round((completedCount / INITIAL_CHECKLIST.length) * 100)}%</span>
                  </div>
                  <div role="progressbar" aria-label="Application checklist progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((completedCount / INITIAL_CHECKLIST.length) * 100)} className="mt-4 h-2 overflow-hidden rounded-full bg-[#e4e8e2]">
                    <div className="h-full rounded-full bg-[#4c9b67] transition-all" style={{ width: `${(completedCount / INITIAL_CHECKLIST.length) * 100}%` }} />
                  </div>
                  {nextChecklistItem && (
                    <div className="mt-5 rounded-2xl bg-[#f2f4ef] p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#667169]">Next unfinished step</p>
                      <p className="mt-2 text-sm font-bold leading-5 text-[#253d2e]">{nextChecklistItem.label}</p>
                    </div>
                  )}
                  <div className="mt-5 grid gap-3">
                    {INITIAL_CHECKLIST.map((item) => (
                      <label key={item.id} className={`flex min-h-16 cursor-pointer gap-3 rounded-2xl border p-4 transition ${activeChecklist[item.id] ? "border-[#77ae89]/40 bg-[#edf6ef]" : "border-[#17211b]/10 bg-white hover:border-[#77ae89]/45"}`}>
                        <input type="checkbox" checked={Boolean(activeChecklist[item.id])} onChange={(event) => {
                          if (!selectedOpportunityId) return;
                          setChecklistByOpportunity((current) => setChecklistItem(
                            { version: 2, selectedOpportunityId, checklistByOpportunity: current },
                            selectedOpportunityId,
                            item.id,
                            event.target.checked,
                          ).checklistByOpportunity);
                        }} className="mt-0.5 h-5 w-5 shrink-0 accent-[#2f704a]" />
                        <span><span className={`block text-sm font-bold leading-5 ${activeChecklist[item.id] ? "text-[#315d43] line-through" : ""}`}>{item.label}</span><span className="mt-1 block text-xs leading-5 text-[#748077]">{item.detail}</span></span>
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

        <footer className="mt-16 flex flex-col gap-2 border-t border-[#17211b]/10 pt-5 text-xs text-[#68736c] sm:flex-row sm:items-center sm:justify-between">
          <p>Research aid only. Verify eligibility and instructions on the official source.</p>
          <p>Current opportunities, program routes, and historical awards are labeled separately.</p>
        </footer>
      </div>
    </main>
  );
}
