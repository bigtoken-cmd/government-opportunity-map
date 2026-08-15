export interface CalibrationScopeOverride {
  profileKey: string;
  opportunityId: string;
  previous: {
    relevant: boolean;
    actionable: boolean;
  };
  corrected: {
    relevant: boolean;
    actionable: boolean;
  };
  adjudicatedAt: string;
  reason: string;
}

/**
 * Auditable post-freeze label corrections. The original calibration log remains
 * unchanged so benchmark drift is visible rather than silently rewritten.
 */
export const CALIBRATION_SCOPE_OVERRIDES: readonly CalibrationScopeOverride[] = [{
  profileKey: "healthcare",
  opportunityId: "grants-359666",
  previous: {
    relevant: true,
    actionable: true,
  },
  corrected: {
    relevant: false,
    actionable: false,
  },
  adjudicatedAt: "2026-08-15",
  reason: "The official title targets precision-medicine AI, imaging, and multimodal clinical data; the frozen founder profile targets hospital administrative work and nurse workflow. Their shared healthcare and AI words do not establish project-scope alignment.",
}];
