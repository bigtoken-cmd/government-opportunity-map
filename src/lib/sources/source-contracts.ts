import type { Provenance } from "../opportunity-types";

export type SourceMode = "live" | "cached" | "failure";
export type SourceResultStatus = "live" | "cached" | "cached-fallback" | "unavailable";

export interface CurrentOpportunityRecord {
  kind: "current_opportunity";
  id: string;
  opportunityNumber: string;
  title: string;
  agency: string;
  status: string;
  openDate: string;
  deadline: string;
  assistanceListings: readonly string[];
  description: string;
  detailStatus?: "enriched" | "unavailable" | "not-requested";
  eligibleApplicantTypes?: readonly string[];
  additionalEligibility?: string;
  fundingInstruments?: readonly string[];
  awardFloor?: number;
  awardCeiling?: number;
  estimatedFunding?: number;
  expectedAwards?: number;
  costSharing?: boolean;
  applicationRoute?: string;
  source: Provenance;
}

export interface ProgramContextRecord {
  kind: "program_context";
  id: string;
  assistanceListing: string;
  title: string;
  agency: string;
  objective: string;
  source: Provenance;
}

export interface HistoricalAwardRecord {
  kind: "historical_award";
  id: string;
  title: string;
  agency: string;
  branch?: string;
  program?: string;
  phase?: string;
  recipient: string;
  amount?: number;
  startDate: string;
  endDate: string;
  assistanceListing: string;
  description: string;
  researchKeywords?: readonly string[];
  source: Provenance;
}

export type SourcedGovernmentRecord =
  | CurrentOpportunityRecord
  | ProgramContextRecord
  | HistoricalAwardRecord;

export interface SourceResult<TRecord extends SourcedGovernmentRecord> {
  source: string;
  sourceUrl: string;
  status: SourceResultStatus;
  retrievedAt: string;
  records: readonly TRecord[];
  warning: string | null;
}

export interface SourceAdapterOptions {
  fetcher?: typeof fetch;
  now?: () => Date;
  mode?: SourceMode;
}
