export const EDITABLE_EVIDENCE_PROFILE_FIELDS = [
  "companyName",
  "description",
  "industry",
  "technology",
  "location",
  "customers",
  "researchActivities",
] as const;

export type EditableEvidenceProfileField =
  (typeof EDITABLE_EVIDENCE_PROFILE_FIELDS)[number];

function supportedValue(value: string) {
  const normalized = value.trim().toLocaleLowerCase("en-US");
  return normalized
    && ![
      "unknown",
      "n/a",
      "na",
      "tbd",
      "pending",
      "not provided",
      "not available",
      "to be determined",
    ].includes(normalized)
    && !normalized.startsWith("unknown ")
    && !normalized.includes("founder input needed")
    && !normalized.includes("leave blank");
}

export function pickSupportedEvidenceProfile(
  value: unknown,
): Partial<Record<EditableEvidenceProfileField, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const candidate = value as Record<string, unknown>;
  const profile: Partial<Record<EditableEvidenceProfileField, string>> = {};
  for (const field of EDITABLE_EVIDENCE_PROFILE_FIELDS) {
    const fieldValue = candidate[field];
    if (typeof fieldValue !== "string" || !supportedValue(fieldValue)) continue;
    profile[field] = fieldValue.trim();
  }
  return profile;
}
