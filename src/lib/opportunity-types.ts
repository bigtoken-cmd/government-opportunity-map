/** Shared contracts for deterministic, source-backed opportunity matching. */
export type FactState = "current" | "historical" | "unknown";
export type RecordKind = "opportunity" | "program" | "award";
export type SnapshotStatus = "live" | "cached_official_snapshot";
export type FitStatus = "Strong Fit" | "Potential Fit" | "No Fit";
export type DecisionLabel =
  | "Pursue now"
  | "Verify first"
  | "Partner-dependent"
  | "Watch"
  | "Skip";
export type RouteType = "direct" | "partner" | "verify" | "watch";
export type SemanticAlignment = "strong" | "partial" | "weak";
export type SemanticMismatchCode =
  | "different_primary_outcome"
  | "different_end_user"
  | "different_research_domain"
  | "generic_domain_overlap_only";

export interface SemanticFitReview {
  alignment: SemanticAlignment;
  companyEvidenceIds: readonly string[];
  opportunityEvidenceIds: readonly string[];
  mismatchCodes: readonly SemanticMismatchCode[];
  provider: "openai";
  model: "gpt-5.6-luna";
  basis: "official-scope-cap-only";
}

export interface EvidenceMapping {
  companyFact: string;
  companyEvidenceId?: string;
  opportunityFact: string;
  opportunityEvidenceId: string;
  sourceUrl: string;
}

export interface RecommendationConcern {
  severity: "blocking" | "verify" | "caution";
  text: string;
  evidenceId?: string;
  sourceUrl?: string;
}

export interface RecommendationAction {
  type: "apply" | "verify" | "find-partner" | "monitor";
  text: string;
}

export interface Provenance {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  retrievedAt: string;
  factState: FactState;
  snapshotStatus: SnapshotStatus;
  note?: string;
}

export interface SourcedFact<T> {
  value: T;
  provenance: Provenance;
}

export type RegistrationState = "yes" | "no" | "unknown";

export interface FounderFacts {
  location?: string;
  industry?: string;
  technology?: string;
  customers?: string;
  researchActivities?: string;
  yearFounded?: string;
  employees?: string;
  revenue?: string;
  capitalRaised?: string;
  capitalNeed?: string;
  useOfFunds?: string;
  applicantType?: string;
  legalEntityType?: string;
  ownership?: string;
  productStage?: string;
  researchStage?: string;
  smallBusinessStatus?: string;
  usEntityStatus?: string;
}

export interface CompanyProfile {
  id: string;
  name: string;
  description: string;
  missionAreas: readonly string[];
  exactTerms: readonly string[];
  controlledConcepts: readonly string[];
  technologyAndRd: readonly string[];
  customerUses: readonly string[];
  operatingGeographies: readonly string[];
  targetAmount?: { min?: number; max?: number; currency: "USD" };
  legalEntityTypes: readonly string[];
  applicantTypes: readonly string[];
  samRegistration: RegistrationState;
  uei: RegistrationState;
  usEntity: RegistrationState;
  smallBusiness: RegistrationState;
  requiredClearances: readonly string[];
  certifications: readonly string[];
  founderFacts?: FounderFacts;
  profileProvenance: Provenance;
}

export interface EligibilityRequirement {
  applicantTypes?: readonly string[];
  excludedApplicantTypes?: readonly string[];
  legalEntityTypes?: readonly string[];
  samRegistration?: boolean;
  uei?: boolean;
  usEntity?: boolean;
  smallBusiness?: boolean;
  clearances?: readonly string[];
  certifications?: readonly string[];
  allowedGeographies?: readonly string[];
  /** Critical notice-specific requirements that the source record did not expose. */
  unverifiedCriticalFields?: readonly string[];
  /** A capable teammate can cure this blocker, but the company cannot proceed alone. */
  partnerMaySatisfy?: readonly (
    | "applicantType"
    | "legalEntityType"
    | "clearances"
    | "certifications"
    | "geography"
  )[];
}

export interface OpportunityConceptEvidence {
  missionAreas: readonly string[];
  exactTerms: readonly string[];
  controlledConcepts: readonly string[];
  technologyAndRd: readonly string[];
  customerUses: readonly string[];
}

export interface Opportunity {
  id: string;
  title: string;
  opportunityNumber?: string;
  recordKind: RecordKind;
  source: Provenance;
  agency: string;
  opportunityStatus: "open" | "forecast" | "program" | "closed" | "historical";
  deadline?: string;
  amount?: { min?: number; max?: number; currency: "USD" };
  assistanceListings?: readonly string[];
  costShare?: boolean;
  applicationRoute?: string;
  fundingInstruments?: readonly string[];
  eligibilitySummary?: string;
  noticeDetailStatus?: "enriched" | "unavailable" | "not-requested";
  documentRequirements?: readonly string[];
  scopeSummary?: string;
  titleConcepts?: OpportunityConceptEvidence;
  missionAreas: readonly string[];
  exactTerms: readonly string[];
  controlledConcepts: readonly string[];
  technologyAndRd: readonly string[];
  customerUses: readonly string[];
  geographies: readonly string[];
  eligibility: EligibilityRequirement;
}

export interface EligibilityCheck {
  field: string;
  state: "pass" | "fail" | "unknown" | "partner";
  detail: string;
}

export interface ScoreBreakdown {
  mission: number;
  exactTerms: number;
  controlledConcepts: number;
  technologyAndRd: number;
  customerUse: number;
  amount: number;
  geography: number;
  total: number;
}

export interface MatchResult {
  companyId: string;
  opportunityId: string;
  fitStatus: FitStatus;
  decision: DecisionLabel;
  score: ScoreBreakdown;
  eligibility: readonly EligibilityCheck[];
  matchedConceptGroups: readonly string[];
  unknownCriticalFacts: readonly string[];
  titleDomainMatch?: boolean;
  scopeExactTermMatch?: boolean;
  scopeDomainMatch?: boolean;
  /** Raw deterministic score remains in score.total; this optional value is a Luna-reviewed downward cap only. */
  effectiveScore?: number;
  semanticReview?: SemanticFitReview;
  reason: string;
}
