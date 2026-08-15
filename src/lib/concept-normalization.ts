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

  const hasHealthcare = hasAny(
    text,
    ["healthcare", "hospital", "nurse", "clinical", "patient", "biomedical"],
  );
  if (hasHealthcare) {
    add(result.missionAreas, "healthcare delivery");
    add(result.missionAreas, "biomedical research");
    add(result.technologyAndRd, "software R&D");
    add(result.technologyAndRd, "clinical validation");
    add(result.customerUses, "hospital operations");
    add(result.customerUses, "health systems");
  }
  if (text.includes("healthcare")) add(result.exactTerms, "healthcare");
  if (hasAny(text, ["hospital", "nurse", "clinical", "patient", "biomedical"])) {
    add(result.controlledConcepts, "hospital innovation");
  }

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

  const hasWater = hasAny(text, [
    "municipal water",
    "water loss",
    "water sensor",
    "water infrastructure",
    "water reclamation",
    "water efficiency",
  ]);
  if (hasWater) {
    add(result.missionAreas, "water resilience");
    add(result.missionAreas, "municipal infrastructure");
    add(result.technologyAndRd, "sensor R&D");
    add(result.technologyAndRd, "water analytics");
    add(result.customerUses, "municipal utilities");
  }
  if (text.includes("municipal water")) add(result.exactTerms, "municipal water");
  if (hasAny(text, ["water loss", "water sensor", "water reclamation", "water efficiency"])) {
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
  ]);
  if (hasCybersecurity) {
    add(result.missionAreas, "cybersecurity");
    add(result.technologyAndRd, "cybersecurity R&D");
    add(result.customerUses, "small organizations");
    if (text.includes("federal") || text.includes("homeland")) {
      add(result.missionAreas, "homeland security");
      add(result.controlledConcepts, "federal security");
      add(result.customerUses, "federal agencies");
    }
  }
  if (text.includes("cybersecurity")) add(result.exactTerms, "cybersecurity");
  if (text.includes("threat detection")) add(result.exactTerms, "threat detection");
  if (hasAny(text, ["cyberspace", "security analytics", "secure data", "cyber resilience"])) {
    add(result.controlledConcepts, "cyber resilience");
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
