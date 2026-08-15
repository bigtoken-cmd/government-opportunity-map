export type CalibrationSplit = "calibration" | "locked-holdout";

export interface CalibrationJudgment {
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
        sourceId: "grants-359666",
        sourceUrl: "https://www.grants.gov/search-results-detail/359666",
        retrievedAt,
        provenanceHash: "cf1ab4c233d47862fd6385e3f4ffc3c1c805ed3c0c2091a50bd211b5280bc302",
        direct: 1,
        synonym: 1,
        broadMission: 1,
        relevant: true,
        actionable: true,
      },
      {
        sourceId: "grants-360954",
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
        sourceId: "grants-306824",
        sourceUrl: "https://www.grants.gov/search-results-detail/306824",
        retrievedAt,
        provenanceHash: "7cda1f047d71c115db7eec5d201e6279fa31537b1c5ff4c6f19ef789b3a9a415",
        direct: 1,
        synonym: 1,
        broadMission: 1,
        relevant: true,
        actionable: true,
      },
      {
        sourceId: "grants-360954",
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
        sourceId: "grants-362396",
        sourceUrl: "https://www.grants.gov/search-results-detail/362396",
        retrievedAt,
        provenanceHash: "c2a9f053cb307fa22c769b07896bcad487fb81a6900d8cc1e6f6a44951cd89a6",
        direct: 1,
        synonym: 1,
        broadMission: 1,
        relevant: true,
        actionable: true,
      },
      {
        sourceId: "grants-360954",
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
        sourceId: "grants-357554",
        sourceUrl: "https://www.grants.gov/search-results-detail/357554",
        retrievedAt,
        provenanceHash: "1f2864b279bb07096ff17dd450d59f1e8ce2c03098d0c7ca7f54c98397e710fa",
        direct: 1,
        synonym: 1,
        broadMission: 1,
        relevant: true,
        actionable: true,
      },
      {
        sourceId: "grants-360954",
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
        sourceId: "grants-306824",
        sourceUrl: "https://www.grants.gov/search-results-detail/306824",
        retrievedAt,
        provenanceHash: "7cda1f047d71c115db7eec5d201e6279fa31537b1c5ff4c6f19ef789b3a9a415",
        direct: 0,
        synonym: 0,
        broadMission: 1,
        relevant: false,
        actionable: false,
      },
    ],
  },
  {
    profileKey: "bookkeeping-control",
    query: "",
    split: "calibration",
    judgments: [
      {
        sourceId: "grants-306824",
        sourceUrl: "https://www.grants.gov/search-results-detail/306824",
        retrievedAt,
        provenanceHash: "7cda1f047d71c115db7eec5d201e6279fa31537b1c5ff4c6f19ef789b3a9a415",
        direct: 0,
        synonym: 0,
        broadMission: 1,
        relevant: false,
        actionable: false,
      },
    ],
  },
  {
    profileKey: "dog-grooming-control",
    query: "",
    split: "calibration",
    judgments: [
      {
        sourceId: "grants-360954",
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
    profileKey: "staffing-control",
    query: "",
    split: "locked-holdout",
    judgments: [
      {
        sourceId: "grants-360954",
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
