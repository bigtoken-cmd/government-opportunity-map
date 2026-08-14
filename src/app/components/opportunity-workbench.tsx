"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { rankOpportunities } from "@/lib/opportunity-matching";
import type {
  CompanyProfile as MatchingCompanyProfile,
  MatchResult,
  Opportunity as MatchingOpportunity,
  RegistrationState,
} from "@/lib/opportunity-types";

type Stage = "intake" | "review" | "results" | "workspace";
type IntakeMethod = "website" | "document" | "manual";
type DemoKey = "healthcare" | "manufacturing" | "water" | "cyber" | "consumer";
type FitTier = "Likely Fit" | "Potential Fit" | "Adjacent";
type Decision = "Pursue now" | "Verify first" | "Partner-dependent" | "Watch" | "Skip";

type CompanyProfile = {
  demoKey: DemoKey | "custom";
  companyName: string;
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
  demoKeys: DemoKey[];
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
  profile?: Partial<CompanyProfile> & {
    companyName?: string;
    website?: string;
    description?: string;
    industry?: string;
    technology?: string;
  };
  evidence?: Array<{ field: string; value: string; sourceUrl: string }>;
  retrievedAt?: string;
  warning?: string;
  error?: string;
  fallback?: string;
};

type SourceHealth = {
  status: "idle" | "checking" | "live" | "cached" | "cached-fallback" | "unavailable";
  message: string;
};

type GrantsSourceResponse = {
  sourceStatus?: SourceHealth["status"];
  warning?: string | null;
  records?: Array<{
    opportunityNumber?: string;
    status?: string;
    closeDate?: string;
  }>;
};

type SpendingSourceResponse = {
  sourceStatus?: SourceHealth["status"];
  warning?: string | null;
  records?: Array<{ awardId?: string }>;
};

const EMPTY_PROFILE: CompanyProfile = {
  demoKey: "custom",
  companyName: "",
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

const DEMO_PROFILES: Array<{ key: DemoKey; label: string; detail: string; profile: CompanyProfile }> = [
  {
    key: "healthcare",
    label: "AI Healthcare",
    detail: "15-person Utah SaaS company",
    profile: {
      ...EMPTY_PROFILE,
      demoKey: "healthcare",
      companyName: "AI Healthcare demo company",
      description:
        "AI-powered software that helps hospitals reduce administrative work for nurses.",
      industry: "Healthcare technology",
      technology: "Artificial intelligence, health IT, workflow automation",
      location: "Utah, United States",
      employees: "15",
      revenue: "$1M ARR",
      capitalRaised: "$2.5M",
      capitalNeed: "$500K–$2M",
      useOfFunds: "Product development and hospital pilots",
      customers: "Hospitals and health systems",
      researchActivities: "Software R&D and hospital pilot validation",
      applicantType: "U.S. for-profit small business — founder confirmation needed",
    },
  },
  {
    key: "manufacturing",
    label: "Advanced Manufacturing",
    detail: "35-person Utah hardware company",
    profile: {
      ...EMPTY_PROFILE,
      demoKey: "manufacturing",
      companyName: "Advanced Manufacturing demo company",
      description: "Advanced manufacturing for lightweight aerospace components.",
      industry: "Advanced manufacturing and aerospace",
      technology: "Lightweight materials, precision manufacturing",
      location: "Utah, United States",
      employees: "35",
      revenue: "$3M",
      capitalRaised: "$8M",
      capitalNeed: "$2M–$5M",
      useOfFunds: "Manufacturing scale-up and R&D",
      customers: "Aerospace and defense manufacturers",
      researchActivities: "Materials and manufacturing-process R&D",
      applicantType: "U.S. for-profit small business — founder confirmation needed",
    },
  },
  {
    key: "water",
    label: "Climate / Water",
    detail: "10-person municipal water startup",
    profile: {
      ...EMPTY_PROFILE,
      demoKey: "water",
      companyName: "Climate / Water Technology demo company",
      description: "Sensor and AI platform reducing municipal water loss.",
      industry: "Water and climate technology",
      technology: "Water sensors, leak analytics, artificial intelligence",
      location: "Utah, United States",
      employees: "10",
      revenue: "$500K",
      capitalRaised: "$1.5M",
      capitalNeed: "$500K–$3M",
      useOfFunds: "Product development and municipal pilots",
      customers: "Municipal utilities and public works departments",
      researchActivities: "Sensor, analytics, and pilot R&D",
      applicantType: "U.S. for-profit small business — founder confirmation needed",
    },
  },
  {
    key: "cyber",
    label: "Cybersecurity",
    detail: "22-person Utah security startup",
    profile: {
      ...EMPTY_PROFILE,
      demoKey: "cyber",
      companyName: "Cybersecurity demo company",
      description: "AI-powered threat detection for small and mid-sized organizations.",
      industry: "Cybersecurity",
      technology: "Artificial intelligence, threat detection, security analytics",
      location: "Utah, United States",
      employees: "22",
      revenue: "$2M ARR",
      capitalRaised: "$5M",
      capitalNeed: "$1M–$3M",
      useOfFunds: "R&D and federal/commercial expansion",
      customers: "Small and mid-sized organizations",
      researchActivities: "Detection-model and security-platform R&D",
      applicantType: "U.S. for-profit small business — founder confirmation needed",
    },
  },
  {
    key: "consumer",
    label: "Consumer / Workforce",
    detail: "Intentionally difficult case",
    profile: {
      ...EMPTY_PROFILE,
      demoKey: "consumer",
      companyName: "Consumer / Workforce Technology demo company",
      description: "Marketplace connecting parents with local youth activities and enrichment programs.",
      industry: "Consumer marketplace technology",
      technology: "Marketplace software and local discovery",
      location: "Utah, United States",
      employees: "8",
      revenue: "$750K",
      capitalRaised: "$1M",
      capitalNeed: "$250K–$1M",
      useOfFunds: "Expansion and technology development",
      customers: "Parents and local youth-activity providers",
      researchActivities: "No clear federal R&D activity confirmed",
      applicantType: "U.S. for-profit small business — founder confirmation needed",
    },
  },
];

const COMMON_APPLICATION_FIELDS: OpportunityCard["applicationFields"] = [
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

const OPPORTUNITIES: OpportunityCard[] = [
  {
    id: "grants-pa-27-100",
    demoKeys: ["healthcare"],
    title: "NIH, CDC and FDA Small Business Innovation Research Grant",
    agency: "National Institutes of Health",
    opportunityNumber: "PA-27-100 · Grants.gov ID 359671",
    sourceKind: "Current opportunity",
    sourceLabel: "Official Simpler.Grants.gov opportunity record",
    sourceUrl: "https://simpler.grants.gov/opportunity/d1ba49e5-3684-4420-849a-ab2330ec493e",
    retrievedAt: "August 14, 2026",
    deadline: "April 5, 2027",
    amount: "See official notice; varies by phase",
    fitTier: "Potential Fit",
    decision: "Verify first",
    relationship: "Posted current opportunity; applicant-type rule verified, scientific fit still unconfirmed",
    reasons: [
      "The notice is an active small-business R&D route across NIH, CDC, and FDA.",
      "The profile includes healthcare software R&D and commercialization through hospital pilots.",
    ],
    concerns: [
      "This is a broad omnibus SBIR notice, not an AI-specific topic endorsement.",
      "U.S. small-business ownership, research leadership, work location, and institute interest are unconfirmed.",
    ],
    nextAction: "Check the participating NIH institute’s research interests, then verify every SBIR small-business rule before drafting aims.",
    applicationFields: COMMON_APPLICATION_FIELDS,
  },
  {
    id: "grants-rfa-rm-27-013",
    demoKeys: ["healthcare"],
    title: "Model-to-Clinic for Precision Medicine with AI (PRIMED-AI)",
    agency: "National Institutes of Health",
    opportunityNumber: "RFA-RM-27-013 · Grants.gov ID 359666 · ALN 93.310",
    sourceKind: "Current opportunity",
    sourceLabel: "Official Simpler.Grants.gov opportunity record",
    sourceUrl: "https://simpler.grants.gov/opportunity/360c4588-1512-4fa4-9b61-52a3f1d6c368",
    retrievedAt: "August 14, 2026",
    deadline: "October 19, 2026",
    amount: "See official notice",
    fitTier: "Adjacent",
    decision: "Verify first",
    relationship: "Current AI-health opportunity; scope maturity is the main blocker",
    reasons: [
      "The notice explicitly combines AI, precision medicine, imaging, and multimodal health data.",
      "Small businesses and other for-profit organizations are listed as eligible applicant categories.",
    ],
    concerns: [
      "The program expects a validated multimodal imaging clinical-decision-support prototype.",
      "Administrative workflow software may fall outside the required scientific scope.",
    ],
    nextAction: "Read the required prototype and data modalities first; skip this route if the product is not imaging-based clinical decision support.",
    applicationFields: COMMON_APPLICATION_FIELDS,
  },
  {
    id: "nsf-seed-route",
    demoKeys: ["healthcare", "manufacturing", "water", "cyber"],
    title: "NSF America’s Seed Fund",
    agency: "National Science Foundation",
    opportunityNumber: "Program route — Project Pitch first",
    sourceKind: "Program route",
    sourceLabel: "Official NSF Seed Fund page",
    sourceUrl: "https://seedfund.nsf.gov/",
    retrievedAt: "August 14, 2026",
    deadline: "Project Pitch accepted on a rolling basis",
    amount: "Verify current phase guidance",
    fitTier: "Potential Fit",
    decision: "Verify first",
    relationship: "Program route, not a promise of eligibility or funding",
    reasons: [
      "The profile describes technology R&D with commercialization potential.",
      "The proposed work is framed as product development rather than general expansion alone.",
    ],
    concerns: [
      "Technical innovation and high-risk R&D must be stronger than routine product engineering.",
      "Small-business ownership and principal-investigator requirements are unconfirmed.",
    ],
    nextAction: "Draft the short Project Pitch around the technical risk, innovation, market need, and R&D plan.",
    applicationFields: COMMON_APPLICATION_FIELDS,
  },
  {
    id: "grants-pd-19-088y",
    demoKeys: ["manufacturing"],
    title: "Advanced Manufacturing",
    agency: "U.S. National Science Foundation",
    opportunityNumber: "PD-19-088Y · ALN 47.041",
    sourceKind: "Current opportunity",
    sourceLabel: "Official Grants.gov opportunity record",
    sourceUrl: "https://www.grants.gov/search-results-detail/306824",
    retrievedAt: "August 14, 2026",
    deadline: "Proposals accepted anytime",
    amount: "See official program guidance",
    fitTier: "Potential Fit",
    decision: "Verify first",
    relationship: "Current research opportunity; direct startup suitability is not established",
    reasons: [
      "The exact program theme is advanced manufacturing and the startup describes process and materials R&D.",
      "Grants.gov lists the applicant category as unrestricted.",
    ],
    concerns: [
      "This is a research program, not a startup scale-up grant.",
      "A research-appropriate principal investigator, proposal type, and genuinely novel research question are unconfirmed.",
    ],
    nextAction: "Read the NSF program guidance and confirm whether the R&D should be led by the startup, an academic partner, or not pursued through this route.",
    applicationFields: COMMON_APPLICATION_FIELDS,
  },
  {
    id: "grants-r26as00079",
    demoKeys: ["water"],
    title: "Title XVI Water Reclamation and Reuse Projects",
    agency: "Bureau of Reclamation",
    opportunityNumber: "R26AS00079 · Grants.gov ID 362396 · ALN 15.504",
    sourceKind: "Current opportunity",
    sourceLabel: "Official Grants.gov opportunity record",
    sourceUrl: "https://www.grants.gov/search-results-detail/362396",
    retrievedAt: "August 14, 2026",
    deadline: "Round 1: August 26, 2026 · Final: August 26, 2027",
    amount: "See official notice",
    fitTier: "Adjacent",
    decision: "Partner-dependent",
    relationship: "Current infrastructure opportunity; the startup is not a listed direct applicant",
    reasons: [
      "Municipal water efficiency and pilot deployment relate to the startup’s customer problem.",
      "A public water entity could have a use for the startup’s sensors and analytics within a larger project.",
    ],
    concerns: [
      "Eligible applicants are public water or power authorities, municipalities, tribes, districts, and similar entities.",
      "The startup should not apply alone or treat vendor participation as guaranteed grant eligibility.",
    ],
    nextAction: "Ask a qualifying municipal water partner whether the technology belongs in its eligible project before doing any grant-writing work.",
    applicationFields: COMMON_APPLICATION_FIELDS,
  },
  {
    id: "dhs-sbir-route",
    demoKeys: ["cyber"],
    title: "DHS Small Business Innovation Research",
    agency: "Department of Homeland Security",
    opportunityNumber: "Program route — verify a current cybersecurity topic",
    sourceKind: "Program route",
    sourceLabel: "Official DHS Science & Technology SBIR page",
    sourceUrl: "https://www.dhs.gov/science-and-technology/sbir",
    retrievedAt: "August 14, 2026",
    deadline: "Verify current solicitation",
    amount: "Varies by phase and solicitation",
    fitTier: "Potential Fit",
    decision: "Verify first",
    relationship: "Potential R&D route; no current topic has been confirmed",
    reasons: [
      "Threat detection and security analytics align with DHS mission areas.",
      "The profile includes product R&D and possible federal expansion.",
    ],
    concerns: [
      "A current DHS solicitation topic must match the specific threat-detection capability.",
      "General market expansion is not a fundable R&D objective.",
    ],
    nextAction: "Review current DHS topics and write a one-page technical gap statement before pursuing a proposal.",
    applicationFields: COMMON_APPLICATION_FIELDS,
  },
];

function createMatchingOpportunity(
  id: string,
  details: Omit<MatchingOpportunity, "id" | "title" | "agency" | "source">,
): MatchingOpportunity {
  const display = OPPORTUNITIES.find((item) => item.id === id);
  if (!display) throw new Error(`Missing display record for ${id}`);
  return {
    id,
    title: display.title,
    agency: display.agency,
    source: {
      sourceId: display.opportunityNumber,
      sourceName: display.sourceLabel,
      sourceUrl: display.sourceUrl,
      retrievedAt: "2026-08-14T21:00:00.000Z",
      factState: "current",
      snapshotStatus: "cached_official_snapshot",
      note:
        display.sourceKind === "Program route"
          ? "Official program page snapshot. This is not an active funding notice."
          : "Official opportunity snapshot. Recheck the live record before acting.",
    },
    ...details,
  };
}

const MATCHING_OPPORTUNITIES: readonly MatchingOpportunity[] = [
  createMatchingOpportunity("grants-pa-27-100", {
    recordKind: "opportunity",
    opportunityStatus: "open",
    deadline: "2027-04-05T23:59:59Z",
    missionAreas: ["healthcare delivery", "biomedical research"],
    exactTerms: ["healthcare", "small business R&D"],
    controlledConcepts: ["commercialization", "hospital innovation"],
    technologyAndRd: ["software R&D", "clinical validation"],
    customerUses: ["hospital operations"],
    geographies: ["United States"],
    eligibility: {
      applicantTypes: ["small business"],
      usEntity: true,
      smallBusiness: true,
    },
  }),
  createMatchingOpportunity("grants-rfa-rm-27-013", {
    recordKind: "opportunity",
    opportunityStatus: "open",
    deadline: "2026-10-19T23:59:59Z",
    missionAreas: ["healthcare delivery", "precision medicine"],
    exactTerms: ["artificial intelligence", "multimodal imaging"],
    controlledConcepts: ["clinical decision support", "health data"],
    technologyAndRd: ["artificial intelligence", "clinical validation"],
    customerUses: ["health systems"],
    geographies: ["United States"],
    eligibility: {
      applicantTypes: ["small business", "for-profit"],
      samRegistration: true,
      uei: true,
      usEntity: true,
    },
  }),
  createMatchingOpportunity("nsf-seed-route", {
    recordKind: "program",
    opportunityStatus: "program",
    missionAreas: ["technology commercialization"],
    exactTerms: ["high-risk R&D"],
    controlledConcepts: ["technical innovation"],
    technologyAndRd: ["research and development"],
    customerUses: ["commercialization"],
    geographies: ["United States"],
    eligibility: {
      applicantTypes: ["small business"],
      usEntity: true,
      smallBusiness: true,
    },
  }),
  createMatchingOpportunity("grants-pd-19-088y", {
    recordKind: "opportunity",
    opportunityStatus: "open",
    missionAreas: ["advanced manufacturing", "aerospace"],
    exactTerms: ["advanced manufacturing"],
    controlledConcepts: ["lightweight components", "manufacturing innovation"],
    technologyAndRd: ["materials R&D", "manufacturing process R&D"],
    customerUses: ["aerospace manufacturing"],
    geographies: ["United States"],
    eligibility: {
      samRegistration: true,
      uei: true,
    },
  }),
  createMatchingOpportunity("grants-r26as00079", {
    recordKind: "opportunity",
    opportunityStatus: "open",
    deadline: "2026-08-26T23:59:59Z",
    missionAreas: ["water resilience", "municipal infrastructure"],
    exactTerms: ["water reuse", "municipal water"],
    controlledConcepts: ["water efficiency", "public infrastructure"],
    technologyAndRd: ["sensor R&D", "water analytics"],
    customerUses: ["municipal utilities"],
    geographies: ["Utah", "United States"],
    eligibility: {
      applicantTypes: ["public water entity", "municipality", "tribe", "water district"],
      samRegistration: true,
      uei: true,
      partnerMaySatisfy: ["applicantType"],
    },
  }),
  createMatchingOpportunity("dhs-sbir-route", {
    recordKind: "program",
    opportunityStatus: "program",
    missionAreas: ["cybersecurity", "homeland security"],
    exactTerms: ["threat detection", "small business innovation"],
    controlledConcepts: ["cyber resilience", "federal security"],
    technologyAndRd: ["cybersecurity R&D", "artificial intelligence"],
    customerUses: ["federal agencies", "small organizations"],
    geographies: ["United States"],
    eligibility: {
      applicantTypes: ["small business"],
      samRegistration: true,
      uei: true,
      usEntity: true,
      smallBusiness: true,
    },
  }),
];

function hasAny(text: string, terms: readonly string[]) {
  return terms.some((term) => text.includes(term));
}

function registrationState(value: string): RegistrationState {
  const normalized = value.trim().toLowerCase();
  if (/^(yes|active|registered|confirmed)$/.test(normalized)) return "yes";
  if (/^(no|inactive|not registered)$/.test(normalized)) return "no";
  return "unknown";
}

function parseTargetAmount(value: string): MatchingCompanyProfile["targetAmount"] {
  const amounts = [...value.matchAll(/\$?\s*([\d.]+)\s*([km])/gi)].map((match) => {
    const multiplier = match[2].toLowerCase() === "m" ? 1_000_000 : 1_000;
    return Number(match[1]) * multiplier;
  });
  if (!amounts.length) return undefined;
  return {
    min: Math.min(...amounts),
    max: Math.max(...amounts),
    currency: "USD",
  };
}

function toMatchingProfile(profile: CompanyProfile): MatchingCompanyProfile {
  const text = [
    profile.description,
    profile.industry,
    profile.technology,
    profile.useOfFunds,
    profile.customers,
    profile.researchActivities,
  ]
    .join(" ")
    .toLowerCase();
  const missionAreas: string[] = [];
  const exactTerms: string[] = [];
  const controlledConcepts: string[] = [];
  const technologyAndRd: string[] = [];
  const customerUses: string[] = [];
  const operatingGeographies: string[] = [];
  const add = (target: string[], value: string) => {
    if (!target.includes(value)) target.push(value);
  };
  const hasResearch = /r&d|research|product development|technical development/.test(text) &&
    !/no clear federal r&d|no research/.test(text);

  if (hasAny(text, ["healthcare", "hospital", "nurse", "clinical", "patient"])) {
    add(missionAreas, "healthcare delivery");
    add(missionAreas, "biomedical research");
    add(exactTerms, "healthcare");
    add(controlledConcepts, "hospital innovation");
    add(technologyAndRd, "software R&D");
    add(technologyAndRd, "clinical validation");
    add(customerUses, "hospital operations");
    add(customerUses, "health systems");
  }
  if (hasAny(text, ["artificial intelligence", "machine learning", " ai ", "ai-powered"])) {
    add(exactTerms, "artificial intelligence");
    add(technologyAndRd, "artificial intelligence");
  }
  if (hasAny(text, ["advanced manufacturing", "aerospace", "lightweight component"])) {
    add(missionAreas, "advanced manufacturing");
    add(missionAreas, "aerospace");
    add(exactTerms, "advanced manufacturing");
    add(controlledConcepts, "lightweight components");
    add(controlledConcepts, "manufacturing innovation");
    add(technologyAndRd, "materials R&D");
    add(technologyAndRd, "manufacturing process R&D");
    add(customerUses, "aerospace manufacturing");
  }
  if (hasAny(text, ["municipal water", "water loss", "water sensor", "water infrastructure"])) {
    add(missionAreas, "water resilience");
    add(missionAreas, "municipal infrastructure");
    add(exactTerms, "municipal water");
    add(controlledConcepts, "water efficiency");
    add(controlledConcepts, "public infrastructure");
    add(technologyAndRd, "sensor R&D");
    add(technologyAndRd, "water analytics");
    add(customerUses, "municipal utilities");
  }
  if (hasAny(text, ["cybersecurity", "threat detection", "security analytics"])) {
    add(missionAreas, "cybersecurity");
    add(exactTerms, "threat detection");
    add(controlledConcepts, "cyber resilience");
    add(technologyAndRd, "cybersecurity R&D");
    add(customerUses, "small organizations");
    if (text.includes("federal")) {
      add(missionAreas, "homeland security");
      add(controlledConcepts, "federal security");
      add(customerUses, "federal agencies");
    }
  }
  if (hasResearch) {
    add(missionAreas, "technology commercialization");
    add(controlledConcepts, "technical innovation");
    add(technologyAndRd, "research and development");
    add(customerUses, "commercialization");
    add(controlledConcepts, "commercialization");
  }
  if (profile.location.toLowerCase().includes("utah")) add(operatingGeographies, "Utah");
  if (/united states|\bu\.s\.?\b|utah/i.test(profile.location)) add(operatingGeographies, "United States");

  const applicantText = profile.applicantType.toLowerCase();
  const applicantConfirmed =
    applicantText.length > 0 &&
    !applicantText.includes("unknown") &&
    !applicantText.includes("confirmation needed");
  const applicantTypes: string[] = [];
  const legalEntityTypes: string[] = [];
  if (applicantText.includes("small business")) add(applicantTypes, "small business");
  if (applicantText.includes("for-profit")) {
    add(applicantTypes, "for-profit");
    add(legalEntityTypes, "for-profit");
  }

  return {
    id: profile.demoKey,
    name: profile.companyName,
    description: profile.description,
    missionAreas,
    exactTerms,
    controlledConcepts,
    technologyAndRd,
    customerUses,
    operatingGeographies,
    targetAmount: parseTargetAmount(profile.capitalNeed),
    legalEntityTypes,
    applicantTypes,
    samRegistration: registrationState(profile.samStatus),
    uei: profile.uei.trim() ? "yes" : "unknown",
    usEntity: applicantConfirmed && /u\.s\.|united states/.test(applicantText) ? "yes" : "unknown",
    smallBusiness: applicantConfirmed && applicantText.includes("small business") ? "yes" : "unknown",
    requiredClearances: [],
    certifications: [],
    profileProvenance: {
      sourceId: profile.demoKey,
      sourceName: "Founder-confirmed company profile",
      sourceUrl: profile.website || "https://government-opportunity-map.bigtoken.workers.dev/",
      retrievedAt: new Date().toISOString(),
      factState: "unknown",
      snapshotStatus: "live",
      note: "Company facts remain founder-controlled and are not government eligibility determinations.",
    },
  };
}

function mapRankedResults(profile: CompanyProfile): RankedOpportunityCard[] {
  const displayById = new Map(OPPORTUNITIES.map((item) => [item.id, item]));
  return rankOpportunities(toMatchingProfile(profile), MATCHING_OPPORTUNITIES)
    .filter((result) => result.decision !== "Skip" && result.score.total >= 35)
    .map((result: MatchResult) => {
      const display = displayById.get(result.opportunityId);
      if (!display) throw new Error(`Missing display details for ${result.opportunityId}`);
      const fitTier: FitTier =
        result.fitStatus === "Strong Fit"
          ? "Likely Fit"
          : display.fitTier === "Adjacent"
            ? "Adjacent"
            : "Potential Fit";
      const eligibilityChecks = result.eligibility
        .filter((check) => check.state !== "pass")
        .map((check) => check.detail);
      return {
        ...display,
        fitTier,
        decision: result.decision,
        score: result.score.total,
        eligibilityChecks,
        concerns: [...new Set([...display.concerns, ...eligibilityChecks])],
      };
    })
    .slice(0, 3);
}

const INITIAL_CHECKLIST = [
  { id: "registrations", label: "Confirm SAM.gov registration and UEI", detail: "Required before many federal submissions." },
  { id: "eligibility", label: "Verify every applicant-type requirement", detail: "Check ownership, location, size, and research-employment rules." },
  { id: "notice", label: "Select the exact current funding notice", detail: "A program family is not the same as an open opportunity." },
  { id: "scope", label: "Write the technical problem and R&D scope", detail: "Separate research risk from normal product work or expansion." },
  { id: "budget", label: "Build an evidence-backed budget", detail: "Use only costs allowed by the selected notice." },
  { id: "package", label: "Review the official application package", detail: "Leave unsupported answers blank until the founder supplies them." },
];

const HEALTHCARE_HISTORY = {
  recipient: "PROFUSA, INC.",
  awardId: "R01EB016414",
  amount: "$4,881,972",
  assistanceListing: "93.310",
  startDate: "September 15, 2012",
  endDate: "June 30, 2016",
  description: "IMPLANTABLE MULTI-ANALYTE SENSORS FOR THE CONTINUOUS MONITORING OF BODY CHEMISTRI",
  sourceUrl: "https://www.usaspending.gov/award/ASST_NON_R01EB016414_075/",
  retrievedAt: "August 14, 2026",
};

const STORAGE_KEY = "government-opportunity-map-workspace-v1";

function inferDemoKey(text: string): DemoKey | "custom" {
  const value = text.toLowerCase();
  if (/nurse|hospital|healthcare|clinical|patient/.test(value)) return "healthcare";
  if (/aerospace|manufactur|lightweight component/.test(value)) return "manufacturing";
  if (/water|municipal|leak|climate/.test(value)) return "water";
  if (/cyber|threat|security/.test(value)) return "cyber";
  if (/parent|youth activit|enrichment|marketplace/.test(value)) return "consumer";
  return "custom";
}

function profileFromText(text: string): CompanyProfile {
  const demoKey = inferDemoKey(text);
  const preset = DEMO_PROFILES.find((item) => item.key === demoKey);
  if (preset) return { ...preset.profile, description: text };
  return {
    ...EMPTY_PROFILE,
    description: text,
    industry: "Founder confirmation needed",
    technology: "Founder confirmation needed",
    location: "Founder confirmation needed",
  };
}

function StepRail({ stage }: { stage: Stage }) {
  const activeIndex = stage === "intake" ? 0 : stage === "review" ? 0 : stage === "results" ? 1 : 2;
  const steps = ["Verified profile", "Opportunity map", "Application workspace"];
  return (
    <ol className="grid gap-2 sm:grid-cols-3" aria-label="Progress">
      {steps.map((step, index) => (
        <li
          key={step}
          className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${
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

function AppHeader({ onReset, saved }: { onReset: () => void; saved: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-[#17211b]/10 bg-[#f4f2eb]/90 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-3 sm:px-8 lg:px-12">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#173d2c] text-sm font-bold text-white">OM</span>
          <div>
            <p className="text-sm font-semibold tracking-tight">Opportunity Map</p>
            <p className="text-[11px] text-[#667169]">Founder-first government intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 text-xs text-[#667169] sm:flex">
            <span className={`h-2 w-2 rounded-full ${saved ? "bg-[#4c9b67]" : "bg-[#d1a24b]"}`} />
            {saved ? "Saved on this device" : "Saving workspace"}
          </span>
          <button
            type="button"
            onClick={onReset}
            className="rounded-full border border-[#17211b]/12 bg-white px-4 py-2 text-xs font-semibold transition hover:border-[#173d2c]/35"
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
  wide = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  wide?: boolean;
  multiline?: boolean;
}) {
  const className =
    "mt-2 w-full rounded-2xl border border-[#17211b]/12 bg-white px-4 py-3 text-sm text-[#17211b] outline-none transition placeholder:text-[#9ba29d] focus:border-[#3f7d59] focus:ring-4 focus:ring-[#3f7d59]/10";
  return (
    <label className={wide ? "sm:col-span-2" : ""}>
      <span className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#657168]">
        {label}
        <span className="normal-case tracking-normal text-[#8a938d]">Founder confirms</span>
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={4}
          className={className}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={className}
        />
      )}
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
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [manualText, setManualText] = useState("");
  const [documentName, setDocumentName] = useState("");
  const [documentMessage, setDocumentMessage] = useState("");
  const [sourceEvidence, setSourceEvidence] = useState<string[]>([]);
  const [intakeStatus, setIntakeStatus] = useState<"idle" | "loading" | "error">("idle");
  const [intakeMessage, setIntakeMessage] = useState("");
  const [selectedOpportunityId, setSelectedOpportunityId] = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState(false);
  const [grantsHealth, setGrantsHealth] = useState<SourceHealth>({ status: "idle", message: "" });
  const [spendingHealth, setSpendingHealth] = useState<SourceHealth>({ status: "idle", message: "" });

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as {
            stage?: Stage;
            profile?: CompanyProfile;
            selectedOpportunityId?: string;
            checklist?: Record<string, boolean>;
            sourceEvidence?: string[];
          };
          if (parsed.profile) setProfile(parsed.profile);
          if (parsed.stage) setStage(parsed.stage);
          if (parsed.selectedOpportunityId) setSelectedOpportunityId(parsed.selectedOpportunityId);
          if (parsed.checklist) setChecklist(parsed.checklist);
          if (parsed.sourceEvidence) setSourceEvidence(parsed.sourceEvidence);
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ stage, profile, selectedOpportunityId, checklist, sourceEvidence }),
      );
      setSaved(true);
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [checklist, hydrated, profile, selectedOpportunityId, sourceEvidence, stage]);

  const profileKey = profile.demoKey === "custom" ? inferDemoKey(`${profile.description} ${profile.industry} ${profile.technology}`) : profile.demoKey;
  const matches = useMemo(() => mapRankedResults(profile), [profile]);
  const currentNoticeCount = matches.filter((item) => item.sourceKind !== "Program route").length;
  const selectedOpportunity =
    matches.find((item) => item.id === selectedOpportunityId) ??
    OPPORTUNITIES.find((item) => item.id === selectedOpportunityId) ??
    matches[0] ??
    null;
  const completedCount = INITIAL_CHECKLIST.filter((item) => checklist[item.id]).length;

  useEffect(() => {
    if (stage !== "results") return;

    const controller = new AbortController();
    const sourceCheckTimer = window.setTimeout(() => {
      const currentRecord = matches.find((item) => item.sourceKind === "Current opportunity");
      if (currentRecord) {
        const opportunityNumber = currentRecord.opportunityNumber.split(" · ")[0];
        setGrantsHealth({ status: "checking", message: `Checking ${opportunityNumber} against the live Grants.gov catalog…` });
        void fetch("/api/sources/grants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opportunityNumber }),
          signal: controller.signal,
        })
          .then(async (response) => {
            if (!response.ok) throw new Error("Source route failed");
            const result = (await response.json()) as GrantsSourceResponse;
            const record = result.records?.[0];
            const status = result.sourceStatus ?? "unavailable";
            const message =
              status === "live" && record
                ? `Live Grants.gov check: ${record.opportunityNumber ?? opportunityNumber} is ${record.status ?? "listed"}${record.closeDate ? `; catalog close date ${record.closeDate}` : ""}.`
                : result.warning ?? "Live catalog check returned no validated record; the audited snapshot remains labeled.";
            setGrantsHealth({ status, message });
          })
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === "AbortError") return;
            setGrantsHealth({ status: "unavailable", message: "The browser could not complete the live catalog check. The audited snapshot remains labeled." });
          });
      } else {
        setGrantsHealth({ status: "idle", message: "No current notice was ranked, so no live opportunity status is implied." });
      }

      if (profileKey === "healthcare") {
        setSpendingHealth({ status: "checking", message: "Checking USAspending.gov for same-program historical context…" });
        void fetch("/api/sources/usaspending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assistanceListing: HEALTHCARE_HISTORY.assistanceListing }),
          signal: controller.signal,
        })
          .then(async (response) => {
            if (!response.ok) throw new Error("Source route failed");
            const result = (await response.json()) as SpendingSourceResponse;
            const status = result.sourceStatus ?? "unavailable";
            const message =
              status === "live"
                ? `Live USAspending query validated ${result.records?.length ?? 0} business prime award record${result.records?.length === 1 ? "" : "s"} with primary Assistance Listing ${HEALTHCARE_HISTORY.assistanceListing}.`
                : result.warning ?? "Historical source check returned no validated records; the audited snapshot remains labeled.";
            setSpendingHealth({ status, message });
          })
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === "AbortError") return;
            setSpendingHealth({ status: "unavailable", message: "The browser could not complete the live historical check. The audited snapshot remains labeled." });
          });
      } else {
        setSpendingHealth({ status: "idle", message: "" });
      }
    }, 0);

    return () => {
      window.clearTimeout(sourceCheckTimer);
      controller.abort();
    };
  }, [matches, profileKey, stage]);

  function resetWorkspace() {
    window.localStorage.removeItem(STORAGE_KEY);
    setStage("intake");
    setProfile(EMPTY_PROFILE);
    setWebsiteUrl("");
    setManualText("");
    setDocumentName("");
    setDocumentMessage("");
    setSourceEvidence([]);
    setSelectedOpportunityId("");
    setChecklist({});
    setIntakeMessage("");
  }

  function loadDemo(key: DemoKey) {
    const preset = DEMO_PROFILES.find((item) => item.key === key);
    if (!preset) return;
    setProfile({ ...preset.profile });
    setSourceEvidence(["Startup facts: official hackathon test case supplied by the sponsor."]);
    setStage("review");
    setIntakeMessage("");
  }

  async function analyzeWebsite(event: FormEvent) {
    event.preventDefault();
    setIntakeStatus("loading");
    setIntakeMessage("");
    try {
      const response = await fetch("/api/intake/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl }),
      });
      const result = (await response.json()) as WebsiteResponse;
      if (!response.ok || !result.profile) throw new Error(result.error ?? result.fallback ?? "Website review failed.");
      const nextProfile: CompanyProfile = {
        ...EMPTY_PROFILE,
        ...result.profile,
        demoKey: inferDemoKey(`${result.profile.description ?? ""} ${result.profile.industry ?? ""}`),
        applicantType: "Unknown — founder input needed",
        ownership: "Unknown — founder input needed",
        samStatus: "Unknown",
      };
      setProfile(nextProfile);
      setSourceEvidence(
        (result.evidence ?? []).map((item) => `${item.field}: extracted from ${new URL(item.sourceUrl).hostname}`),
      );
      setIntakeMessage(result.warning ?? "Website facts extracted. Confirm them before matching.");
      setStage("review");
      setIntakeStatus("idle");
    } catch (error) {
      setIntakeStatus("error");
      setIntakeMessage(error instanceof Error ? error.message : "Use the manual description instead.");
    }
  }

  function beginManual(event: FormEvent) {
    event.preventDefault();
    if (manualText.trim().length < 35) {
      setIntakeStatus("error");
      setIntakeMessage("Add a few sentences about the product, customers, location, and planned use of funds.");
      return;
    }
    setProfile(profileFromText(manualText.trim()));
    setSourceEvidence(["Company description: provided directly by the founder."]);
    setIntakeStatus("idle");
    setIntakeMessage("");
    setStage("review");
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

  function buildMap() {
    const inferred = inferDemoKey(`${profile.description} ${profile.industry} ${profile.technology}`);
    setProfile((current) => ({ ...current, demoKey: inferred }));
    setStage("results");
    setSelectedOpportunityId("");
  }

  function openWorkspace(opportunity: OpportunityCard) {
    setSelectedOpportunityId(opportunity.id);
    setStage("workspace");
  }

  return (
    <main className="min-h-screen bg-[#f4f2eb] text-[#17211b]">
      <AppHeader onReset={resetWorkspace} saved={saved} />
      <div className="mx-auto w-full max-w-7xl px-5 pb-20 pt-7 sm:px-8 lg:px-12">
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
                <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[#edf0ea] p-1.5">
                  {([
                    ["website", "Website"],
                    ["document", "PDF"],
                    ["manual", "Describe it"],
                  ] as Array<[IntakeMethod, string]>).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setMethod(value);
                        setIntakeMessage("");
                      }}
                      className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                        method === value ? "bg-white text-[#173d2c] shadow-sm" : "text-[#6b756e] hover:text-[#2f4d3b]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {method === "website" && (
                  <form onSubmit={analyzeWebsite} className="mt-7">
                    <label className="text-xs font-bold uppercase tracking-[0.13em] text-[#647067]">Public HTTPS company website</label>
                    <input
                      type="url"
                      required
                      value={websiteUrl}
                      onChange={(event) => setWebsiteUrl(event.target.value)}
                      placeholder="https://yourcompany.com"
                      className="mt-2 w-full rounded-2xl border border-[#17211b]/12 bg-white px-4 py-4 text-base outline-none transition focus:border-[#3f7d59] focus:ring-4 focus:ring-[#3f7d59]/10"
                    />
                    <button
                      type="submit"
                      disabled={intakeStatus === "loading"}
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
                      <span className="mt-1 text-xs text-[#748077]">Up to 10 MB. Nothing is submitted to a government system.</span>
                    </label>
                    {documentName && <p className="mt-3 text-sm font-semibold text-[#315d43]">Attached: {documentName}</p>}
                    {documentMessage && <p className="mt-2 text-xs leading-5 text-[#6b756e]">{documentMessage}</p>}
                    <form onSubmit={beginManual} className="mt-5">
                      <label className="text-xs font-bold uppercase tracking-[0.13em] text-[#647067]">Extracted or pasted company summary</label>
                      <textarea
                        value={manualText}
                        onChange={(event) => setManualText(event.target.value)}
                        rows={6}
                        placeholder="Paste the one-pager text here if the PDF is image-based."
                        className="mt-2 w-full rounded-2xl border border-[#17211b]/12 bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-[#3f7d59] focus:ring-4 focus:ring-[#3f7d59]/10"
                      />
                      <button type="submit" className="mt-4 w-full rounded-2xl bg-[#173d2c] px-5 py-4 text-sm font-bold text-white hover:bg-[#214f39]">
                        Review extracted profile
                      </button>
                    </form>
                  </div>
                )}

                {method === "manual" && (
                  <form onSubmit={beginManual} className="mt-7">
                    <label className="text-xs font-bold uppercase tracking-[0.13em] text-[#647067]">Plain-language company description</label>
                    <textarea
                      value={manualText}
                      onChange={(event) => setManualText(event.target.value)}
                      rows={8}
                      placeholder="We’re a Utah company building… We sell to… We need funding for…"
                      className="mt-2 w-full rounded-2xl border border-[#17211b]/12 bg-white px-4 py-4 text-sm leading-6 outline-none focus:border-[#3f7d59] focus:ring-4 focus:ring-[#3f7d59]/10"
                    />
                    <button type="submit" className="mt-4 w-full rounded-2xl bg-[#173d2c] px-5 py-4 text-sm font-bold text-white hover:bg-[#214f39]">
                      Turn this into a profile
                    </button>
                  </form>
                )}

                {intakeMessage && (
                  <div className={`mt-4 rounded-2xl px-4 py-3 text-sm ${intakeStatus === "error" ? "bg-[#fff0e9] text-[#8b3c21]" : "bg-[#edf5ef] text-[#315d43]"}`}>
                    {intakeMessage}
                  </div>
                )}

                <div className="my-7 flex items-center gap-3 text-xs uppercase tracking-[0.14em] text-[#8a938d]">
                  <span className="h-px flex-1 bg-[#17211b]/10" />
                  Or load a test case
                  <span className="h-px flex-1 bg-[#17211b]/10" />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DEMO_PROFILES.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => loadDemo(item.key)}
                      className="rounded-2xl border border-[#17211b]/10 bg-white px-4 py-3 text-left transition hover:border-[#3f7557]/40 hover:bg-[#f8faf6]"
                    >
                      <span className="block text-sm font-bold">{item.label}</span>
                      <span className="mt-1 block text-xs text-[#748077]">{item.detail}</span>
                    </button>
                  ))}
                </div>
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

            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.34fr]">
              <div className="grid gap-5 rounded-[2rem] border border-[#17211b]/10 bg-white/80 p-5 shadow-[0_20px_65px_rgba(23,33,27,0.06)] sm:grid-cols-2 sm:p-7">
                <Field label="Company name" value={profile.companyName} onChange={(value) => updateProfile("companyName", value)} placeholder="Legal or public name" />
                <Field label="Website" value={profile.website} onChange={(value) => updateProfile("website", value)} placeholder="https://…" />
                <Field wide multiline label="What the company does" value={profile.description} onChange={(value) => updateProfile("description", value)} />
                <Field label="Industry" value={profile.industry} onChange={(value) => updateProfile("industry", value)} />
                <Field label="Technology" value={profile.technology} onChange={(value) => updateProfile("technology", value)} />
                <Field label="Location" value={profile.location} onChange={(value) => updateProfile("location", value)} placeholder="City, state, country" />
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

              <aside className="space-y-4">
                <div className="rounded-[1.75rem] border border-[#17211b]/10 bg-[#173d2c] p-6 text-white">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#acd8ba]">Profile provenance</p>
                  <ul className="mt-5 grid gap-3 text-sm leading-6 text-white/85">
                    {sourceEvidence.length ? sourceEvidence.map((item) => <li key={item}>{item}</li>) : <li>No source recorded yet.</li>}
                    <li>All fields remain editable and require founder confirmation.</li>
                  </ul>
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
                <button type="button" onClick={buildMap} className="w-full rounded-2xl bg-[#173d2c] px-5 py-4 text-sm font-bold text-white shadow-[0_16px_35px_rgba(23,61,44,0.18)] hover:bg-[#214f39]">
                  Confirm profile and build map
                </button>
              </aside>
            </div>
          </section>
        )}

        {stage === "results" && (
          <section className="pt-10">
            <div className={`rounded-[1.5rem] border px-5 py-4 text-sm ${grantsHealth.status === "live" ? "border-[#8fc59f]/55 bg-[#edf7ef] text-[#28583a]" : "border-[#d5c58f]/50 bg-[#fff9e9] text-[#66531c]"}`}>
              <div className="sm:flex sm:items-center sm:justify-between sm:gap-5">
                <p>
                  <span className="font-bold">Source mode:</span>{" "}
                  {currentNoticeCount
                    ? `${currentNoticeCount} current Grants.gov record${currentNoticeCount === 1 ? "" : "s"} in the audited August 14 snapshot; program routes remain labeled separately.`
                    : "Audited official-program fallback only. No program route is being presented as a live notice."}
                </p>
                <span className="mt-2 inline-flex shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold sm:mt-0">
                  {grantsHealth.status === "checking"
                    ? "Checking live catalog"
                    : grantsHealth.status === "live"
                      ? "Live API validated"
                      : grantsHealth.status === "cached-fallback" || grantsHealth.status === "unavailable"
                        ? "Cached fallback active"
                        : currentNoticeCount
                          ? "Official snapshot"
                          : "Fallback active"}
                </span>
              </div>
              {grantsHealth.message && <p className="mt-2 text-xs leading-5 opacity-80">{grantsHealth.message}</p>}
            </div>

            <div className="mt-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#3f7557]">Government Opportunity Map</p>
                <h1 className="mt-3 max-w-4xl text-balance text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
                  {matches.length ? `${matches.length} route${matches.length === 1 ? "" : "s"} worth a careful look.` : "No strong traditional grant match found."}
                </h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-[#5f6b63]">
                  {matches.length
                    ? "Unknown critical facts cap these at Potential Fit. Open the evidence before deciding whether to pursue."
                    : profileKey === "consumer"
                      ? "This founder may be better served by customer revenue, partnerships, local programs, or procurement discovery than by forcing a weak federal grant match."
                      : "The current audited route set does not support a defensible recommendation for this profile yet."}
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
                  <p className="mt-4 max-w-2xl text-base leading-7 text-[#5f6b63]">The profile’s main need is expansion, and no confirmed federal R&D, eligible public-service applicant, or mission-specific grant purpose is present. Broad words such as “youth,” “education,” or “workforce” are not enough.</p>
                  <div className="mt-7 grid gap-3 sm:grid-cols-2">
                    {["Explore municipal or school partnerships", "Search for government customer demand", "Check Utah and local economic-development programs", "Revisit grants only when a specific R&D project exists"].map((item) => <div key={item} className="rounded-2xl bg-[#f2f4ef] p-4 text-sm font-semibold leading-6">{item}</div>)}
                  </div>
                </div>
                <aside className="rounded-[2rem] border border-[#d9b45f]/35 bg-[#fff7e5] p-7">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#795c19]">Why this is useful</p>
                  <p className="mt-4 text-lg font-semibold leading-7 text-[#5f4a18]">It prevents a founder from spending weeks on an application built around a superficial keyword match.</p>
                  <button type="button" onClick={() => setStage("review")} className="mt-7 w-full rounded-2xl border border-[#795c19]/20 bg-white px-4 py-3 text-sm font-bold text-[#5f4a18]">Add a specific R&D project</button>
                </aside>
              </div>
            )}

            {profileKey === "healthcare" ? (
              <div className="mt-8 overflow-hidden rounded-[1.75rem] border border-[#17211b]/10 bg-[#eef1ed]">
                <div className="grid lg:grid-cols-[0.7fr_0.3fr]">
                  <div className="p-6 sm:p-7">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#667169]">Historical intelligence</p>
                      <span className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-[#59655e]">Historical award · not open funding</span>
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold tracking-[-0.035em]">{HEALTHCARE_HISTORY.recipient}</h2>
                    <p className="mt-2 text-sm leading-6 text-[#59655e]">{HEALTHCARE_HISTORY.description}</p>
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl bg-white p-4"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#7a837d]">USAspending award amount</p><p className="mt-2 text-sm font-bold">{HEALTHCARE_HISTORY.amount}</p></div>
                      <div className="rounded-2xl bg-white p-4"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#7a837d]">Award ID</p><p className="mt-2 text-sm font-bold">{HEALTHCARE_HISTORY.awardId}</p></div>
                      <div className="rounded-2xl bg-white p-4"><p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#7a837d]">Assistance Listing</p><p className="mt-2 text-sm font-bold">{HEALTHCARE_HISTORY.assistanceListing}</p></div>
                    </div>
                  </div>
                  <aside className="border-t border-[#17211b]/10 bg-white/70 p-6 lg:border-l lg:border-t-0">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#667169]">What this proves</p>
                    <p className="mt-3 text-sm leading-6 text-[#59655e]">This is program-level history under Assistance Listing 93.310. It is not a recipient of the current PRIMED-AI notice and does not prove eligibility.</p>
                    <p className="mt-4 text-xs leading-5 text-[#7a837d]">Period: {HEALTHCARE_HISTORY.startDate} to {HEALTHCARE_HISTORY.endDate}</p>
                    <a href={HEALTHCARE_HISTORY.sourceUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex rounded-xl border border-[#17211b]/12 bg-white px-4 py-3 text-sm font-bold text-[#315d43]">Open USAspending award</a>
                    {spendingHealth.message && (
                      <div className="mt-4 rounded-xl border border-[#17211b]/8 bg-white px-3 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#47795b]">
                          {spendingHealth.status === "checking" ? "Checking live source" : spendingHealth.status === "live" ? "Live API validated" : "Audited fallback"}
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-[#778179]">{spendingHealth.message}</p>
                      </div>
                    )}
                    <p className="mt-3 text-[11px] text-[#8a938d]">Prime award deduplicated · Retrieved {HEALTHCARE_HISTORY.retrievedAt}</p>
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
          <section className="pt-10">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#3f7557]">Application workspace</p>
                <h1 className="mt-3 max-w-4xl text-balance text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Move forward without inventing an answer.</h1>
                <p className="mt-4 max-w-3xl text-base leading-7 text-[#5f6b63]">This prepares known facts and exposes missing work. It does not submit anything to a government system.</p>
              </div>
              <button type="button" onClick={() => setStage("results")} className="w-fit rounded-full border border-[#17211b]/12 bg-white px-4 py-2.5 text-sm font-semibold">Back to map</button>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-[0.62fr_0.38fr]">
              <div className="space-y-6">
                <div className="rounded-[2rem] border border-[#17211b]/10 bg-[#173d2c] p-6 text-white sm:p-8">
                  <div className="flex flex-wrap items-center gap-2"><DecisionPill decision={selectedOpportunity.decision} /><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold">Not submitted</span></div>
                  <p className="mt-7 text-xs font-bold uppercase tracking-[0.15em] text-[#acd8ba]">{selectedOpportunity.agency}</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">{selectedOpportunity.title}</h2>
                  <p className="mt-4 text-sm leading-6 text-white/75">{selectedOpportunity.relationship}</p>
                  <a href={selectedOpportunity.sourceUrl} target="_blank" rel="noreferrer" className="mt-6 inline-flex rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold hover:bg-white/15">Review official instructions</a>
                </div>

                <div className="rounded-[2rem] border border-[#17211b]/10 bg-white/85 p-6 sm:p-8">
                  <div className="flex items-center justify-between gap-4">
                    <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-[#667169]">Prefill map</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Known versus missing</h2></div>
                    <span className="rounded-full bg-[#edf5ef] px-3 py-1.5 text-xs font-bold text-[#315d43]">Source-backed only</span>
                  </div>
                  <div className="mt-6 divide-y divide-[#17211b]/8">
                    {selectedOpportunity.applicationFields.map((field) => {
                      const value = field.profileKey ? String(profile[field.profileKey] ?? "") : "";
                      const known = Boolean(value.trim()) && !value.toLowerCase().includes("unknown") && !value.toLowerCase().includes("needed");
                      return (
                        <div key={field.label} className="grid gap-2 py-4 sm:grid-cols-[0.34fr_0.66fr] sm:items-start">
                          <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#748077]">{field.label}</p>
                          <div>
                            <p className={`text-sm font-semibold leading-6 ${known ? "text-[#253d2e]" : "text-[#8a5b1e]"}`}>{known ? value : "Missing — leave blank until the founder provides it"}</p>
                            <p className="mt-1 text-xs text-[#8a938d]">{known ? "From confirmed company profile" : "No supported value stored"}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <aside className="space-y-5">
                <div className="rounded-[2rem] border border-[#17211b]/10 bg-white/85 p-6 sm:p-7">
                  <div className="flex items-end justify-between gap-4">
                    <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-[#667169]">Persistent checklist</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">{completedCount} of {INITIAL_CHECKLIST.length} complete</h2></div>
                    <span className="text-sm font-bold text-[#315d43]">{Math.round((completedCount / INITIAL_CHECKLIST.length) * 100)}%</span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e4e8e2]"><div className="h-full rounded-full bg-[#4c9b67] transition-all" style={{ width: `${(completedCount / INITIAL_CHECKLIST.length) * 100}%` }} /></div>
                  <div className="mt-6 grid gap-3">
                    {INITIAL_CHECKLIST.map((item) => (
                      <label key={item.id} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${checklist[item.id] ? "border-[#77ae89]/40 bg-[#edf6ef]" : "border-[#17211b]/10 bg-white"}`}>
                        <input type="checkbox" checked={Boolean(checklist[item.id])} onChange={(event) => setChecklist((current) => ({ ...current, [item.id]: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-[#2f704a]" />
                        <span><span className={`block text-sm font-bold ${checklist[item.id] ? "text-[#315d43] line-through" : ""}`}>{item.label}</span><span className="mt-1 block text-xs leading-5 text-[#748077]">{item.detail}</span></span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-[#d9b45f]/35 bg-[#fff7e5] p-6">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#795c19]">Required verification</p>
                  <p className="mt-3 text-sm leading-6 text-[#6c5a2d]">Eligibility remains unconfirmed until the exact current notice, applicant rules, deadline, registrations, and project scope are checked on the official source.</p>
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
