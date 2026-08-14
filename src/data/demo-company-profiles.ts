import type { CompanyProfile, Provenance } from "@/lib/opportunity-types";

const demoProfileProvenance: Provenance = {
  sourceId: "DEMO-PROFILE-2026-08-13",
  sourceName: "GOED bundled demo data",
  sourceUrl: "https://www.grants.gov/",
  retrievedAt: "2026-08-13T00:00:00.000Z",
  factState: "unknown",
  snapshotStatus: "cached_demo_snapshot",
  note: "Illustrative company profile only. Not a live registration or eligibility record.",
};

/** Bundled fictional profiles for deterministic pipeline demos. */
export const demoCompanyProfiles: readonly CompanyProfile[] = [
  {
    id: "demo-riparian-sensing", name: "Riparian Signal Labs", description: "Illustrative watershed monitoring startup.",
    missionAreas: ["water resilience", "environmental monitoring"], exactTerms: ["remote sensing", "water quality"],
    controlledConcepts: ["watershed", "climate resilience"], technologyAndRd: ["sensor systems", "geospatial analytics"], customerUses: ["field monitoring", "decision support"], operatingGeographies: ["Colorado", "United States"], targetAmount: { min: 100000, max: 750000, currency: "USD" }, legalEntityTypes: ["for-profit"], applicantTypes: ["small business"], samRegistration: "yes", uei: "yes", usEntity: "yes", smallBusiness: "yes", requiredClearances: [], certifications: [], profileProvenance: demoProfileProvenance,
  },
  {
    id: "demo-civic-access", name: "Civic Access Studio", description: "Illustrative public-service accessibility software firm.",
    missionAreas: ["digital government", "public access"], exactTerms: ["accessibility", "plain language"], controlledConcepts: ["civic technology", "service design"], technologyAndRd: ["web applications"], customerUses: ["resident services", "case management"], operatingGeographies: ["United States"], targetAmount: { min: 50000, max: 300000, currency: "USD" }, legalEntityTypes: ["for-profit"], applicantTypes: ["small business"], samRegistration: "unknown", uei: "unknown", usEntity: "yes", smallBusiness: "yes", requiredClearances: [], certifications: [], profileProvenance: demoProfileProvenance,
  },
  {
    id: "demo-wildfire-robotics", name: "Frontline Robotics Works", description: "Illustrative wildfire response robotics company.",
    missionAreas: ["wildfire resilience", "public safety"], exactTerms: ["uncrewed systems", "wildfire"], controlledConcepts: ["emergency response", "situational awareness"], technologyAndRd: ["robotics", "computer vision"], customerUses: ["incident command", "field operations"], operatingGeographies: ["Colorado", "California", "United States"], targetAmount: { min: 250000, max: 2000000, currency: "USD" }, legalEntityTypes: ["for-profit"], applicantTypes: ["small business"], samRegistration: "yes", uei: "yes", usEntity: "yes", smallBusiness: "yes", requiredClearances: [], certifications: [], profileProvenance: demoProfileProvenance,
  },
  {
    id: "demo-secure-health", name: "Secure Health Relay", description: "Illustrative health data interoperability company.",
    missionAreas: ["public health", "healthcare delivery"], exactTerms: ["interoperability", "health data"], controlledConcepts: ["care coordination", "privacy"], technologyAndRd: ["health IT", "data integration"], customerUses: ["provider workflow", "population health"], operatingGeographies: ["United States"], targetAmount: { min: 500000, max: 3000000, currency: "USD" }, legalEntityTypes: ["for-profit"], applicantTypes: ["small business"], samRegistration: "yes", uei: "yes", usEntity: "yes", smallBusiness: "unknown", requiredClearances: [], certifications: ["SOC 2"], profileProvenance: demoProfileProvenance,
  },
  {
    id: "demo-rural-energy", name: "Rural Grid Cooperative", description: "Illustrative member-owned rural energy organization.",
    missionAreas: ["energy resilience", "rural development"], exactTerms: ["microgrid", "distributed energy"], controlledConcepts: ["grid modernization", "community resilience"], technologyAndRd: ["energy storage", "grid controls"], customerUses: ["utility operations", "community facilities"], operatingGeographies: ["Colorado", "New Mexico"], targetAmount: { min: 1000000, max: 10000000, currency: "USD" }, legalEntityTypes: ["nonprofit cooperative"], applicantTypes: ["nonprofit"], samRegistration: "yes", uei: "yes", usEntity: "yes", smallBusiness: "no", requiredClearances: [], certifications: [], profileProvenance: demoProfileProvenance,
  },
] as const;
