import { normalizeConcepts } from "../concept-normalization";
import type {
  CompanyProfile,
  RegistrationState,
} from "../opportunity-types";

export interface FounderProfileInput {
  id: string;
  companyName: string;
  website: string;
  description: string;
  industry: string;
  technology: string;
  location: string;
  yearFounded?: string;
  employees?: string;
  revenue?: string;
  capitalRaised?: string;
  capitalNeed: string;
  useOfFunds: string;
  customers: string;
  researchActivities: string;
  applicantType: string;
  legalEntityType?: string;
  ownership?: string;
  productStage?: string;
  researchStage?: string;
  smallBusinessStatus?: string;
  usEntityStatus?: string;
  samStatus: string;
  uei: string;
}

export interface EvidenceOnlyFounderProfile {
  demoKey: "custom";
  description: string;
  industry: string;
  technology: string;
  location: string;
  yearFounded: string;
  employees: string;
  revenue: string;
  capitalRaised: string;
  capitalNeed: string;
  useOfFunds: string;
  customers: string;
  researchActivities: string;
  applicantType: string;
  legalEntityType: string;
  ownership: string;
  productStage: string;
  researchStage: string;
  smallBusinessStatus: string;
  usEntityStatus: string;
  samStatus: string;
  uei: string;
}

export function createEvidenceOnlyFounderProfile(text: string): EvidenceOnlyFounderProfile {
  return {
    demoKey: "custom",
    description: text.trim(),
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
    applicantType: "Unknown — founder input needed",
    legalEntityType: "Unknown — founder input needed",
    ownership: "Unknown — founder input needed",
    productStage: "",
    researchStage: "",
    smallBusinessStatus: "Unknown",
    usEntityStatus: "Unknown",
    samStatus: "Unknown",
    uei: "",
  };
}

function registrationState(value: string): RegistrationState {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (/^(yes|active|registered|confirmed)$/.test(normalized)) return "yes";
  if (/^(no|inactive|not registered)$/.test(normalized)) return "no";
  return "unknown";
}

function parseTargetAmount(value: string): CompanyProfile["targetAmount"] {
  const amounts = [...value.matchAll(/\$?\s*([\d.]+)\s*([km])/gi)]
    .map((match) => {
      const multiplier = match[2].toLocaleLowerCase("en-US") === "m" ? 1_000_000 : 1_000;
      return Number(match[1]) * multiplier;
    })
    .filter(Number.isFinite);
  if (!amounts.length) return undefined;
  return {
    min: Math.min(...amounts),
    max: Math.max(...amounts),
    currency: "USD",
  };
}

function add(target: string[], value: string) {
  if (!target.includes(value)) target.push(value);
}

export function normalizeFounderProfile(input: FounderProfileInput): CompanyProfile {
  const yearFounded = input.yearFounded ?? "";
  const employees = input.employees ?? "";
  const revenue = input.revenue ?? "";
  const capitalRaised = input.capitalRaised ?? "";
  const legalEntityType = input.legalEntityType ?? "";
  const ownership = input.ownership ?? "";
  const productStage = input.productStage ?? "";
  const researchStage = input.researchStage ?? "";
  const smallBusinessStatus = input.smallBusinessStatus ?? "";
  const usEntityStatus = input.usEntityStatus ?? "";
  const concepts = normalizeConcepts(
    [
      input.description,
      input.industry,
      input.technology,
      input.useOfFunds,
      input.customers,
      input.researchActivities,
      productStage,
      researchStage,
    ].join(" "),
  );
  const operatingGeographies: string[] = [];
  const location = input.location.toLocaleLowerCase("en-US");
  if (location.includes("utah")) add(operatingGeographies, "Utah");
  if (/united states|\bu\.s\.?\b|utah/.test(location)) add(operatingGeographies, "United States");

  const applicantText = `${input.applicantType} ${legalEntityType}`.toLocaleLowerCase("en-US");
  const applicantTypes: string[] = [];
  const legalEntityTypes: string[] = [];
  if (applicantText.includes("small business")) add(applicantTypes, "small business");
  if (applicantText.includes("for-profit")) {
    add(applicantTypes, "for-profit");
    add(legalEntityTypes, "for-profit");
  }
  if (applicantText.includes("nonprofit")) {
    add(applicantTypes, "nonprofit");
    add(legalEntityTypes, "nonprofit");
  }
  if (/\bllc\b|limited liability company/.test(applicantText)) {
    add(legalEntityTypes, "limited liability company");
  }
  if (/\bcorporation\b|\bcorp\.?\b/.test(applicantText)) {
    add(legalEntityTypes, "corporation");
  }

  const explicitSmallBusiness = registrationState(smallBusinessStatus);
  const explicitUsEntity = registrationState(usEntityStatus);
  const explicitUei = registrationState(input.uei);
  const founderFacts = Object.fromEntries(
    Object.entries({
      yearFounded,
      employees,
      revenue,
      capitalRaised,
      capitalNeed: input.capitalNeed,
      useOfFunds: input.useOfFunds,
      applicantType: input.applicantType,
      legalEntityType,
      ownership,
      productStage,
      researchStage,
      smallBusinessStatus,
      usEntityStatus,
    }).flatMap(([key, value]) => value.trim() ? [[key, value.trim()]] : []),
  );

  return {
    id: input.id,
    name: input.companyName,
    description: input.description,
    ...concepts,
    operatingGeographies,
    targetAmount: parseTargetAmount(input.capitalNeed),
    legalEntityTypes,
    applicantTypes,
    samRegistration: registrationState(input.samStatus),
    uei: explicitUei !== "unknown"
      ? explicitUei
      : input.uei.trim() && !/^unknown$/i.test(input.uei.trim())
        ? "yes"
        : "unknown",
    usEntity: explicitUsEntity !== "unknown"
      ? explicitUsEntity
      : /\bu\.s\.? entity\b|united states entity/.test(applicantText)
        ? "yes"
        : "unknown",
    smallBusiness: explicitSmallBusiness !== "unknown"
      ? explicitSmallBusiness
      : applicantText.includes("small business")
        ? "yes"
        : "unknown",
    requiredClearances: [],
    certifications: [],
    founderFacts,
    profileProvenance: {
      sourceId: input.id,
      sourceName: "Founder-confirmed company profile",
      sourceUrl: input.website || "https://government-opportunity-map.bigtoken.workers.dev/",
      retrievedAt: new Date().toISOString(),
      factState: "unknown",
      snapshotStatus: "live",
      note: "Company facts remain founder-controlled and are not government eligibility determinations.",
    },
  };
}
