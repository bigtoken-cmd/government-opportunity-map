import assert from "node:assert/strict";
import test from "node:test";
import {
  pickSupportedEvidenceProfile,
} from "../src/lib/intake/evidence-profile";

test("evidence profile merge keeps only supported editable suggestions", () => {
  assert.deepEqual(
    pickSupportedEvidenceProfile({
      companyName: "  Acme Water Labs ",
      description: "Builds municipal water sensors.",
      industry: "Unknown",
      technology: "municipal water sensors",
      location: "Unknown — founder input needed",
      customers: "",
      researchActivities: "Sensor calibration research",
      yearFounded: "2021",
      ownership: "U.S.-owned",
      samStatus: "Active",
    }),
    {
      companyName: "Acme Water Labs",
      description: "Builds municipal water sensors.",
      technology: "municipal water sensors",
      researchActivities: "Sensor calibration research",
    },
  );
});

test("evidence profile merge rejects non-object and non-string suggestions", () => {
  assert.deepEqual(pickSupportedEvidenceProfile(null), {});
  assert.deepEqual(pickSupportedEvidenceProfile({
    companyName: 42,
    description: [],
  }), {});
});
