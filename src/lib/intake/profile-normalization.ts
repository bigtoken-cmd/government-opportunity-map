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

export function inferFounderProfileFields(text: string) {
  const concepts = normalizeConcepts(text);
  const hasMission = (value: string) => concepts.missionAreas.includes(value);
  const industry = hasMission("robotics and autonomous systems")
    ? "Physical AI and robotics"
    : hasMission("advanced manufacturing")
      ? "Advanced manufacturing"
      : hasMission("water resilience")
        ? "Water technology"
        : hasMission("cybersecurity")
          ? "Cybersecurity"
          : hasMission("healthcare delivery")
            ? "Healthcare technology"
            : hasMission("biomedical research")
              ? "Biomedical research"
              : hasMission("education and workforce")
                ? "Education and workforce technology"
                : hasMission("aerospace")
                  ? "Aerospace technology"
                  : "";
  const technologyCandidates = [
    ...concepts.technologyAndRd,
    ...concepts.exactTerms,
    ...concepts.controlledConcepts,
  ].filter((value) => ![
    "technical innovation",
    "commercialization",
    "research and development",
  ].includes(value));
  const domainPattern = hasMission("robotics and autonomous systems")
    ? /robot|physical ai|ai training data|artificial intelligence/i
    : hasMission("advanced manufacturing")
      ? /manufactur|material|aerospace|lightweight/i
      : hasMission("water resilience")
        ? /water|sensor|public infrastructure/i
        : hasMission("cybersecurity")
          ? /cyber|security|threat|federal/i
          : hasMission("healthcare delivery")
            ? /health|hospital|clinical|medical|software|artificial intelligence/i
            : hasMission("biomedical research")
              ? /biomedical|clinical|medical|research|artificial intelligence/i
              : null;
  const domainTechnology = domainPattern
    ? technologyCandidates.filter((value) => domainPattern.test(value))
    : technologyCandidates;
  const technology = [...new Set(domainTechnology.length ? domainTechnology : technologyCandidates)]
    .slice(0, 6)
    .join(", ");
  return { industry, technology };
}

export function normalizeFounderLocation(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.toLocaleLowerCase("en-US").replace(/[.]/g, "").replace(/\s+/g, " ");
  if (/^(?:slc|salt lake city)(?:,? (?:ut|utah))?$/.test(normalized)) {
    return "Salt Lake City, UT";
  }
  return trimmed;
}

export function createEvidenceOnlyFounderProfile(text: string): EvidenceOnlyFounderProfile {
  const inferred = inferFounderProfileFields(text);
  return {
    description: text.trim(),
    industry: inferred.industry,
    technology: inferred.technology,
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

function profileSourceUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "https://government-opportunity-map.bigtoken.workers.dev/";
  const normalized = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(normalized).toString();
  } catch {
    return "https://government-opportunity-map.bigtoken.workers.dev/";
  }
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
  const normalizedLocation = normalizeFounderLocation(input.location);
  const location = normalizedLocation.toLocaleLowerCase("en-US");
  if (location.includes("utah") || location.includes("salt lake city") || /\but\b/.test(location)) {
    add(operatingGeographies, "Utah");
  }
  if (/united states|\bu\.s\.?\b|utah|salt lake city|\but\b/.test(location)) {
    add(operatingGeographies, "United States");
  }

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
      location: normalizedLocation,
      industry: input.industry,
      technology: input.technology,
      customers: input.customers,
      researchActivities: input.researchActivities,
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
      sourceUrl: profileSourceUrl(input.website),
      retrievedAt: new Date().toISOString(),
      factState: "unknown",
      snapshotStatus: "live",
      note: "Company facts remain founder-controlled and are not government eligibility determinations.",
    },
  };
}
