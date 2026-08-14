/** Shared contracts for deterministic, source-backed opportunity matching. */
export type FactState = "current" | "historical" | "unknown";
export type RecordKind = "opportunity" | "award";
export type SnapshotStatus = "live" | "cached_demo_snapshot";
export type FitStatus = "Strong Fit" | "Potential Fit" | "No Fit";
export type DecisionLabel =
  | "Pursue now"
  | "Verify first"
  | "Partner-dependent"
  | "Watch"
  | "Skip";

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
  profileProvenance: Provenance;
}

export interface EligibilityRequirement {
  applicantTypes?: readonly string[];
  legalEntityTypes?: readonly string[];
  samRegistration?: boolean;
  uei?: boolean;
  usEntity?: boolean;
  smallBusiness?: boolean;
  clearances?: readonly string[];
  certifications?: readonly string[];
  allowedGeographies?: readonly string[];
  /** A capable teammate can cure this blocker, but the company cannot proceed alone. */
  partnerMaySatisfy?: readonly ("clearances" | "certifications" | "geography")[];
}

export interface Opportunity {
  id: string;
  title: string;
  recordKind: RecordKind;
  source: Provenance;
  agency: string;
  opportunityStatus: "open" | "forecast" | "closed" | "historical";
  deadline?: string;
  amount?: { min?: number; max?: number; currency: "USD" };
  missionAreas: readonly string[];
  exactTerms: readonly string[];
  controlledConcepts: readonly string[];
  technologyAndRd: readonly string[];
  customerUses: readonly string[];
  geographies: readonly string[];
  eligibility: EligibilityRequirement;
  demoLabel?: string;
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
  reason: string;
}
