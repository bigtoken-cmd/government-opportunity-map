export type CalibrationSplit = "calibration" | "locked-holdout";

export interface CalibrationJudgment {
  opportunityId: string;
  sourceId: string;
  sourceUrl: string;
  retrievedAt: string;
  provenanceHash: string;
  direct: number;
  synonym: number;
  broadMission: number;
  relevant: boolean;
  actionable: boolean;
}

export interface CalibrationQuery {
  profileKey: string;
  query: string;
  split: CalibrationSplit;
  judgments: readonly CalibrationJudgment[];
}

const retrievedAt = "2026-08-14T00:00:00.000Z";

export const CALIBRATION_QUERY_LOG: readonly CalibrationQuery[] = [
  {
    profileKey: "healthcare",
    query: "healthcare",
    split: "calibration",
    judgments: [
      {
        opportunityId: "grants-359666",
        sourceId: "359666",
        sourceUrl: "https://www.grants.gov/search-results-detail/359666",
        retrievedAt,
        provenanceHash: "e7e51033950d1536db682a3c554b645339a8294acd4d42497a403fb86d3c261f",
        direct: 1,
        synonym: 1,
        broadMission: 1,
        relevant: true,
        actionable: true,
      },
      {
        opportunityId: "grants-360954",
        sourceId: "360954",
        sourceUrl: "https://www.grants.gov/search-results-detail/360954",
        retrievedAt,
        provenanceHash: "b819c64e9df1d7ed46ada143df441ce1fe973811d6b4d5634d00e8aed4a41a14",
        direct: 0,
        synonym: 0,
        broadMission: 1,
        relevant: false,
        actionable: false,
      },
    ],
  },
  {
    profileKey: "manufacturing",
    query: "advanced manufacturing",
    split: "calibration",
    judgments: [
      {
        opportunityId: "grants-306824",
        sourceId: "306824",
        sourceUrl: "https://www.grants.gov/search-results-detail/306824",
        retrievedAt,
        provenanceHash: "c954d196c04d8155538752dbb8b60f0710b4fe5bc7d117b63e2d75e0fcd398cd",
        direct: 1,
        synonym: 1,
        broadMission: 1,
        relevant: true,
        actionable: true,
      },
      {
        opportunityId: "grants-360954",
        sourceId: "360954",
        sourceUrl: "https://www.grants.gov/search-results-detail/360954",
        retrievedAt,
        provenanceHash: "b819c64e9df1d7ed46ada143df441ce1fe973811d6b4d5634d00e8aed4a41a14",
        direct: 0,
        synonym: 0,
        broadMission: 1,
        relevant: false,
        actionable: false,
      },
    ],
  },
  {
    profileKey: "water",
    query: "municipal water",
    split: "calibration",
    judgments: [
      {
        opportunityId: "grants-362396",
        sourceId: "362396",
        sourceUrl: "https://www.grants.gov/search-results-detail/362396",
        retrievedAt,
        provenanceHash: "a1c22c2e01acd953e6f3f900e746ed6bd11fc2bddc7e9837e60cc49f7d213e2f",
        direct: 1,
        synonym: 1,
        broadMission: 1,
        relevant: true,
        actionable: true,
      },
      {
        opportunityId: "grants-360954",
        sourceId: "360954",
        sourceUrl: "https://www.grants.gov/search-results-detail/360954",
        retrievedAt,
        provenanceHash: "b819c64e9df1d7ed46ada143df441ce1fe973811d6b4d5634d00e8aed4a41a14",
        direct: 0,
        synonym: 0,
        broadMission: 1,
        relevant: false,
        actionable: false,
      },
    ],
  },
  {
    profileKey: "cyber",
    query: "cybersecurity",
    split: "locked-holdout",
    judgments: [
      {
        opportunityId: "grants-357554",
        sourceId: "357554",
        sourceUrl: "https://www.grants.gov/search-results-detail/357554",
        retrievedAt,
        provenanceHash: "db1178a70cb79e07469c3aa7139841063152e8475acfad8ff6f00918d8a5fb0d",
        direct: 1,
        synonym: 1,
        broadMission: 1,
        relevant: true,
        actionable: true,
      },
      {
        opportunityId: "grants-360954",
        sourceId: "360954",
        sourceUrl: "https://www.grants.gov/search-results-detail/360954",
        retrievedAt,
        provenanceHash: "b819c64e9df1d7ed46ada143df441ce1fe973811d6b4d5634d00e8aed4a41a14",
        direct: 0,
        synonym: 0,
        broadMission: 1,
        relevant: false,
        actionable: false,
      },
    ],
  },
  {
    profileKey: "consumer",
    query: "",
    split: "calibration",
    judgments: [
      {
        opportunityId: "grants-306824",
        sourceId: "306824",
        sourceUrl: "https://www.grants.gov/search-results-detail/306824",
        retrievedAt,
        provenanceHash: "c954d196c04d8155538752dbb8b60f0710b4fe5bc7d117b63e2d75e0fcd398cd",
        direct: 0,
        synonym: 0,
        broadMission: 1,
        relevant: false,
        actionable: false,
      },
    ],
  },
  {
    profileKey: "holdout-bookkeeping",
    query: "",
    split: "calibration",
    judgments: [
      {
        opportunityId: "grants-306824",
        sourceId: "306824",
        sourceUrl: "https://www.grants.gov/search-results-detail/306824",
        retrievedAt,
        provenanceHash: "c954d196c04d8155538752dbb8b60f0710b4fe5bc7d117b63e2d75e0fcd398cd",
        direct: 0,
        synonym: 0,
        broadMission: 1,
        relevant: false,
        actionable: false,
      },
    ],
  },
  {
    profileKey: "holdout-dog-grooming",
    query: "",
    split: "calibration",
    judgments: [
      {
        opportunityId: "grants-360954",
        sourceId: "360954",
        sourceUrl: "https://www.grants.gov/search-results-detail/360954",
        retrievedAt,
        provenanceHash: "b819c64e9df1d7ed46ada143df441ce1fe973811d6b4d5634d00e8aed4a41a14",
        direct: 0,
        synonym: 0,
        broadMission: 1,
        relevant: false,
        actionable: false,
      },
    ],
  },
  {
    profileKey: "holdout-staffing",
    query: "",
    split: "locked-holdout",
    judgments: [
      {
        opportunityId: "grants-360954",
        sourceId: "360954",
        sourceUrl: "https://www.grants.gov/search-results-detail/360954",
        retrievedAt,
        provenanceHash: "b819c64e9df1d7ed46ada143df441ce1fe973811d6b4d5634d00e8aed4a41a14",
        direct: 0,
        synonym: 0,
        broadMission: 1,
        relevant: false,
        actionable: false,
      },
    ],
  },
];
