import assert from "node:assert/strict";
import test from "node:test";
import { normalizeConcepts } from "../src/lib/concept-normalization";
import {
  createEvidenceOnlyFounderProfile,
  normalizeFounderProfile,
} from "../src/lib/intake/profile-normalization";
import { searchGovernmentSources } from "../src/lib/opportunity-search";

test("manual evidence-only intake preserves unsupported company facts as unknown", () => {
  const profile = createEvidenceOnlyFounderProfile("We build AI software for hospitals.");
  assert.equal(profile.description, "We build AI software for hospitals.");
  assert.equal(profile.revenue, "");
  assert.equal(profile.capitalRaised, "");
  assert.equal(profile.applicantType, "Unknown — founder input needed");
  assert.equal(profile.samStatus, "Unknown");
});

test("generic AI language does not create a source query by itself", async () => {
  const company = normalizeFounderProfile({
    id: "generic-ai",
    companyName: "Generic AI",
    website: "",
    description: "Artificial intelligence technology platform.",
    industry: "",
    technology: "",
    location: "",
    capitalNeed: "",
    useOfFunds: "",
    customers: "",
    researchActivities: "",
    applicantType: "Unknown",
    samStatus: "Unknown",
    uei: "",
  });
  const result = await searchGovernmentSources(company, { mode: "cached" });
  assert.equal(result.query.keyword, "");
  assert.equal(result.discovery.recommendations.length, 0);
});

test("controlled synonyms remain distinct from direct terms", () => {
  const concepts = normalizeConcepts("municipal water sensor research");
  assert.ok(concepts.exactTerms.includes("municipal water"));
  assert.ok(concepts.controlledConcepts.includes("water efficiency"));
  assert.notEqual(concepts.exactTerms[0], concepts.controlledConcepts[0]);
});
