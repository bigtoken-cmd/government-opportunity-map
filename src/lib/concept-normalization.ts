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
  const hasClinicalResearch = hasAny(text, [
    "clinical trial",
    "clinical research",
    "oncology",
    "cancer",
    "precision medicine",
    "medical imaging",
    "multimodal data",
  ]);
  const hasHumanPerformanceResearch = text.includes("aerospace medicine")
    && hasAny(text, [
      "human effectiveness",
      "human enabling",
      "human enhancing",
      "human restoring",
      "human sustaining",
    ]);
  const hasSpecializedBiomedicalResearch = hasAny(text, [
    "biomedical",
    "biomechanics",
    "mechanobiology",
    "biological mechanics",
    "living tissue",
    "living system",
  ]) || hasHumanPerformanceResearch;
  const hasBiomedicalResearch = hasClinicalResearch || hasSpecializedBiomedicalResearch;
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
  }
  if (hasClinicalResearch) {
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

  const hasExplicitPhysicalAi = /\bphysical[\s-]+ai\b/.test(text);
  const hasRobotAnchor = /\brobot(?:s|ic|ics)?\b/.test(text);
  const hasVisionLanguageAction = /\bvision-language-action\b|\bvla models?\b/.test(text);
  const hasRoboticsContext = hasRobotAnchor && (
    /\brobotics\b/.test(text)
    || hasAny(text, [
      "robot system",
      "robot training",
      "robot learning",
      "robot policy",
      "robot research",
      "robot development",
      "autonomous system",
      "world model",
      "behavior cloning",
      "diffusion policy",
    ])
  );
  const hasPhysicalAi = hasExplicitPhysicalAi || hasRoboticsContext || hasVisionLanguageAction;
  const hasRoboticsRdEvidence = hasExplicitPhysicalAi
    || hasVisionLanguageAction
    || hasAny(text, [
      "robot learning",
      "robot training",
      "robot policy",
      "robot policies",
      "robot research",
      "robot development",
      "robotics research",
      "robotics r&d",
      "autonomous system",
    ]);
  const hasRobotLearningEvidence = hasPhysicalAi && hasAny(text, [
    "robot policy",
    "robot policies",
    "vision-language-action",
    "vla model",
    "behavior cloning",
    "diffusion policy",
    "diffusion policies",
    "world model",
  ]);
  const hasRoboticsTrainingData = hasPhysicalAi && hasAny(text, [
    "robotics training data",
    "robot training data",
    "human reasoning data",
    "reasoning-rich data",
    "preference data",
    "golden trajectories",
    "eval suite",
    "evaluation suite",
  ]);
  if (hasPhysicalAi) add(result.missionAreas, "robotics and autonomous systems");
  if (hasRoboticsRdEvidence || hasRobotLearningEvidence || hasRoboticsTrainingData) {
    add(result.technologyAndRd, "robotics R&D");
  }
  if (hasExplicitPhysicalAi) add(result.exactTerms, "physical ai");
  if (/\brobotics\b/.test(text)) add(result.exactTerms, "robotics");
  if (hasRobotLearningEvidence) add(result.controlledConcepts, "robot learning");
  if (hasRoboticsTrainingData) add(result.controlledConcepts, "AI training data");
  if (
    hasPhysicalAi
    && hasAny(text, ["teams training", "robot policy", "robot policies", "robotics teams"])
  ) {
    add(result.customerUses, "robotics developers");
  }

  const hasAdvancedManufacturing = text.includes("advanced manufacturing");
  const hasAerospace = text.includes("aerospace");
  const hasLightweightComponents = text.includes("lightweight component");
  const hasManufacturingInnovation = text.includes("manufacturing innovation");
  const hasMaterialsResearch = hasAny(text, [
    "materials r&d",
    "materials research",
    "materials processing",
    "materials engineering",
    "lightweight material",
  ]);
  const hasManufacturingProcessResearch = hasAny(text, [
    "manufacturing process",
    "manufacturing-process",
    "precision manufacturing",
    "manufacturing technologies",
    "manufacturing systems",
    "manufacturing capabilities",
    "manufacturing methods",
    "manufacturing practices",
    "manufacturing machines",
    "manufacturing equipment",
    "cybermanufacturing",
    "nanomanufacturing",
  ]);
  const hasDirectManufacturingEvidence = hasAdvancedManufacturing
    || hasManufacturingProcessResearch;
  if (hasDirectManufacturingEvidence) {
    add(result.missionAreas, "advanced manufacturing");
  }
  if (hasAerospace) {
    add(result.missionAreas, "aerospace");
  }
  if (hasMaterialsResearch) {
    add(result.technologyAndRd, "materials R&D");
  }
  if (hasManufacturingProcessResearch) {
    add(result.technologyAndRd, "manufacturing process R&D");
  }
  if (hasAerospace && hasDirectManufacturingEvidence) {
    add(result.customerUses, "aerospace manufacturing");
  }
  if (hasAdvancedManufacturing) {
    add(result.exactTerms, "advanced manufacturing");
  }
  if (hasLightweightComponents) {
    add(result.controlledConcepts, "lightweight components");
  }
  if (hasManufacturingInnovation) {
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
