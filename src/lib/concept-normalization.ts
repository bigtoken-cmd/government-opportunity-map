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

  if (hasAny(text, ["healthcare", "hospital", "nurse", "clinical", "patient", "biomedical"])) {
    add(result.missionAreas, "healthcare delivery");
    add(result.missionAreas, "biomedical research");
    add(result.exactTerms, "healthcare");
    add(result.controlledConcepts, "hospital innovation");
    add(result.technologyAndRd, "software R&D");
    add(result.technologyAndRd, "clinical validation");
    add(result.customerUses, "hospital operations");
    add(result.customerUses, "health systems");
  }

  if (hasAny(text, ["artificial intelligence", "machine learning", " ai ", "ai-powered"])) {
    add(result.exactTerms, "artificial intelligence");
    add(result.technologyAndRd, "artificial intelligence");
  }

  if (hasAny(text, ["advanced manufacturing", "aerospace", "lightweight component"])) {
    add(result.missionAreas, "advanced manufacturing");
    add(result.missionAreas, "aerospace");
    add(result.exactTerms, "advanced manufacturing");
    add(result.controlledConcepts, "lightweight components");
    add(result.controlledConcepts, "manufacturing innovation");
    add(result.technologyAndRd, "materials R&D");
    add(result.technologyAndRd, "manufacturing process R&D");
    add(result.customerUses, "aerospace manufacturing");
  }

  if (hasAny(text, ["municipal water", "water loss", "water sensor", "water infrastructure", "water reclamation"])) {
    add(result.missionAreas, "water resilience");
    add(result.missionAreas, "municipal infrastructure");
    add(result.exactTerms, "municipal water");
    add(result.controlledConcepts, "water efficiency");
    add(result.controlledConcepts, "public infrastructure");
    add(result.technologyAndRd, "sensor R&D");
    add(result.technologyAndRd, "water analytics");
    add(result.customerUses, "municipal utilities");
  }

  if (hasAny(text, ["cybersecurity", "cyberspace", "threat detection", "security analytics", "secure data"])) {
    add(result.missionAreas, "cybersecurity");
    add(result.exactTerms, "cybersecurity");
    add(result.exactTerms, "threat detection");
    add(result.controlledConcepts, "cyber resilience");
    add(result.technologyAndRd, "cybersecurity R&D");
    add(result.customerUses, "small organizations");
    if (text.includes("federal") || text.includes("homeland")) {
      add(result.missionAreas, "homeland security");
      add(result.controlledConcepts, "federal security");
      add(result.customerUses, "federal agencies");
    }
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
