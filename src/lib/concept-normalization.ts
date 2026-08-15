export interface NormalizedConcepts {
  missionAreas: string[];
  exactTerms: string[];
  controlledConcepts: string[];
  technologyAndRd: string[];
  customerUses: string[];
}

function add(target: string[], value: string) {
  if (!target.includes(value)) target.push(value);
}

function hasAny(text: string, terms: readonly string[]) {
  return terms.some((term) => text.includes(term));
}

/**
 * Deterministic, reviewable concept expansion shared by company and opportunity
 * normalization. Broad words such as "technology" never create a match alone.
 */
export function normalizeConcepts(value: string): NormalizedConcepts {
  const text = ` ${value.toLocaleLowerCase("en-US").replace(/\s+/g, " ")} `;
  const result: NormalizedConcepts = {
    missionAreas: [],
    exactTerms: [],
    controlledConcepts: [],
    technologyAndRd: [],
    customerUses: [],
  };

  const hasHealthcareDelivery = hasAny(text, [
    "healthcare delivery",
    "healthcare operations",
    "hospital",
    "nurse",
    "nursing",
    "health it",
    "digital health",
    "clinical workflow",
    "workflow automation",
    "administrative work",
  ]);
  const hasBiomedicalResearch = hasAny(text, [
    "clinical trial",
    "clinical research",
    "biomedical",
    "oncology",
    "cancer",
    "precision medicine",
    "medical imaging",
    "multimodal data",
  ]);
  if (hasHealthcareDelivery) {
    add(result.missionAreas, "healthcare delivery");
    add(result.controlledConcepts, "hospital innovation");
    if (hasAny(text, ["software", "health it", "workflow", "platform"])) {
      add(result.technologyAndRd, "software R&D");
    }
    if (hasAny(text, ["hospital", "nurse", "workflow", "administrative work"])) {
      add(result.customerUses, "hospital operations");
    }
    if (hasAny(text, ["hospital", "health system", "healthcare delivery", "digital health"])) {
      add(result.customerUses, "health systems");
    }
  }
  if (hasBiomedicalResearch) {
    add(result.missionAreas, "biomedical research");
    add(result.controlledConcepts, "clinical research");
    if (hasAny(text, ["clinical", "trial", "validation"])) {
      add(result.technologyAndRd, "clinical validation");
    }
  }
  if (text.includes("healthcare")) add(result.exactTerms, "healthcare");

  if (hasAny(text, ["artificial intelligence", "machine learning", " ai ", "ai-powered"])) {
    add(result.technologyAndRd, "artificial intelligence");
  }
  if (text.includes("artificial intelligence")) {
    add(result.exactTerms, "artificial intelligence");
  }

  const hasManufacturing = hasAny(text, [
    "advanced manufacturing",
    "aerospace",
    "lightweight component",
    "manufacturing innovation",
  ]);
  if (hasManufacturing) {
    add(result.missionAreas, "advanced manufacturing");
    add(result.missionAreas, "aerospace");
    add(result.technologyAndRd, "materials R&D");
    add(result.technologyAndRd, "manufacturing process R&D");
    add(result.customerUses, "aerospace manufacturing");
  }
  if (text.includes("advanced manufacturing")) {
    add(result.exactTerms, "advanced manufacturing");
  }
  if (text.includes("lightweight component")) {
    add(result.controlledConcepts, "lightweight components");
  }
  if (hasAny(text, ["aerospace", "manufacturing innovation"])) {
    add(result.controlledConcepts, "manufacturing innovation");
  }

  const hasMunicipalWater = /\bmunicipal water\b/.test(text);
  const hasWater = hasMunicipalWater || hasAny(text, [
    "water loss",
    "water sensor",
    "water infrastructure",
    "water reclamation",
    "water efficiency",
    "desalination",
    "water purification",
    "water resources",
  ]);
  if (hasWater) {
    add(result.missionAreas, "water resilience");
    add(result.missionAreas, "municipal infrastructure");
  }
  if (hasAny(text, ["water sensor", "water monitoring", "sensor platform"])) {
    add(result.technologyAndRd, "sensor R&D");
  }
  if (hasAny(text, ["water analytics", "water data analytics"])) {
    add(result.technologyAndRd, "water analytics");
  }
  if (hasMunicipalWater || hasAny(text, [
    "municipal utilities",
    "water utilities",
    "water districts",
    "wastewater districts",
  ])) {
    add(result.customerUses, "municipal utilities");
  }
  if (hasMunicipalWater) add(result.exactTerms, "municipal water");
  if (hasAny(text, [
    "water loss",
    "water sensor",
    "water reclamation",
    "water efficiency",
    "desalination",
    "water purification",
    "water resources",
  ])) {
    add(result.controlledConcepts, "water efficiency");
  }
  if (text.includes("water infrastructure")) {
    add(result.controlledConcepts, "public infrastructure");
  }

  const hasCybersecurity = hasAny(text, [
    "cybersecurity",
    "cyberspace",
    "threat detection",
    "security analytics",
    "secure data",
    "cyber resilience",
    "cybersecurity resilience",
  ]);
  if (hasCybersecurity) {
    add(result.missionAreas, "cybersecurity");
    if (hasAny(text, [" r&d ", "research and development", "cyber research", "security research"])) {
      add(result.technologyAndRd, "cybersecurity R&D");
    }
    if (hasAny(text, [
      "small organizations",
      "mid-sized organizations",
      "small businesses",
      "small business",
    ])) {
      add(result.customerUses, "small organizations");
    }
    if (text.includes("federal") || text.includes("homeland")) {
      add(result.missionAreas, "homeland security");
      add(result.controlledConcepts, "federal security");
      add(result.customerUses, "federal agencies");
    }
  }
  if (text.includes("cybersecurity")) add(result.exactTerms, "cybersecurity");
  if (text.includes("threat detection")) add(result.exactTerms, "threat detection");
  if (hasAny(text, [
    "cyberspace",
    "security analytics",
    "secure data",
    "cyber resilience",
    "cybersecurity resilience",
  ])) {
    add(result.controlledConcepts, "cyber resilience");
  }

  const hasEducation = hasAny(text, [
    "education innovation",
    "graduate medical education",
    "resident physician",
    "medical residency",
    "scholarship",
    "workforce development",
    "training program",
    "curriculum",
  ]);
  if (hasEducation) {
    add(result.missionAreas, "education and workforce");
    add(result.controlledConcepts, "workforce development");
    add(result.customerUses, "educational institutions");
  }

  const hasResearch =
    hasAny(text, [
      " r&d ",
      "research and development",
      "research",
      "product development",
      "technical development",
      "innovation research",
    ]) && !hasAny(text, ["no clear federal r&d", "no research"]);
  if (hasResearch) {
    add(result.missionAreas, "technology commercialization");
    add(result.controlledConcepts, "technical innovation");
    add(result.controlledConcepts, "commercialization");
    add(result.technologyAndRd, "research and development");
    add(result.customerUses, "commercialization");
  }

  return result;
}
