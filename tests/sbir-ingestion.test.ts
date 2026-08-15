import assert from "node:assert/strict";
import test from "node:test";
import {
  SBIR_AWARDS_CSV_URL,
  ingestSbirAwardsCsv,
} from "../src/lib/sources/sbir-ingestion";
import { MemorySbirAwardsStore } from "../src/lib/sources/sbir-store";
import { searchSbirAwards } from "../src/lib/sources/sbir";

const HEADER = [
  "Company",
  "Award Title",
  "Agency",
  "Branch",
  "Phase",
  "Program",
  "Agency Tracking Number",
  "Contract",
  "Proposal Award Date",
  "Contract End Date",
  "Award Year",
  "Award Amount",
].map((value) => `"${value}"`).join(",");

const REPRESENTATIVE_CSV = `${HEADER}\r
"AERODYNE RESEARCH INC","Autonomous Method to Quantify and Localize
Hydrogen Facility Emissions","Department of Energy","ARPA-E","Phase II","STTR","DE-AR0001984","DE-AR0001984","2025-12-19","2026-12-19","2025","965327.0000"\r
"KMS Solutions, LLC","Logistics ""Modeling"" and Simulation for Hypersonics","Department of Defense","Navy","Phase I","SBIR","N252-114-0695","N64267-26-C-7013","2025-11-13","2026-05-12","2026","136428.0000"\r
`;

const FIXTURE_SANITY = {
  minimumInitialRecordCount: 1,
  minimumPreviousRecordRatio: 0.5,
};

function chunkedResponse(csv: string, chunkSize: number) {
  const encoded = new TextEncoder().encode(csv);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < encoded.length; offset += chunkSize) {
        controller.enqueue(encoded.slice(offset, offset + chunkSize));
      }
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      etag: "\"sbir-snapshot-v1\"",
      "last-modified": "Sat, 01 Aug 2026 00:00:00 GMT",
    },
  });
}

test("SBIR ingestion streams quoted and multiline CSV into a compact historical index", async () => {
  const store = new MemorySbirAwardsStore();
  let requestedUrl = "";
  const result = await ingestSbirAwardsCsv(store, {
    fetcher: async (input) => {
      requestedUrl = String(input);
      return chunkedResponse(REPRESENTATIVE_CSV, 7);
    },
    now: () => new Date("2026-08-14T12:00:00.000Z"),
    snapshotSanity: FIXTURE_SANITY,
  });

  assert.equal(requestedUrl, SBIR_AWARDS_CSV_URL);
  assert.equal(result.status, "updated");
  assert.deepEqual(result.metadata, {
    sourceUrl: SBIR_AWARDS_CSV_URL,
    retrievedAt: "2026-08-14T12:00:00.000Z",
    lastModified: "2026-08-01T00:00:00.000Z",
    etag: "\"sbir-snapshot-v1\"",
    recordCount: 2,
  });
  assert.deepEqual(await store.getById("DE-AR0001984"), {
    recordKey: "DE-AR0001984:2025-12-19:965327",
    awardId: "DE-AR0001984",
    awardUrl: "https://www.sbir.gov/awards?keywords=DE-AR0001984",
    title: "Autonomous Method to Quantify and Localize\nHydrogen Facility Emissions",
    agency: "Department of Energy",
    branch: "ARPA-E",
    program: "STTR",
    phase: "Phase II",
    startDate: "2025-12-19",
    endDate: "2026-12-19",
    awardYear: "2025",
    amount: 965327,
    company: "AERODYNE RESEARCH INC",
    researchKeywords: [
      "autonomous",
      "quantify",
      "localize",
      "hydrogen",
      "facility",
      "emissions",
    ],
  });
});

test("SBIR lookup exposes cached historical provenance and never a solicitation", async () => {
  const store = new MemorySbirAwardsStore();
  await ingestSbirAwardsCsv(store, {
    fetcher: async () => chunkedResponse(REPRESENTATIVE_CSV, 13),
    now: () => new Date("2026-08-14T12:00:00.000Z"),
    snapshotSanity: FIXTURE_SANITY,
  });

  const result = await searchSbirAwards("hydrogen emissions", { store });

  assert.equal(result.status, "cached");
  assert.equal(result.sourceUrl, SBIR_AWARDS_CSV_URL);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].kind, "historical_award");
  assert.equal(result.records[0].program, "STTR");
  assert.equal(result.records[0].phase, "Phase II");
  assert.equal(result.records[0].source.factState, "historical");
  assert.equal(result.records[0].source.snapshotStatus, "cached_official_snapshot");
  assert.equal(result.records[0].source.retrievedAt, "2026-08-14T12:00:00.000Z");
  assert.match(result.records[0].source.note ?? "", /not an open solicitation/i);
  assert.match(result.records[0].source.note ?? "", /retrieved 2026-08-14/i);
});

test("SBIR scheduled ingestion uses conditional metadata and preserves the last valid snapshot", async () => {
  const store = new MemorySbirAwardsStore();
  await ingestSbirAwardsCsv(store, {
    fetcher: async () => chunkedResponse(REPRESENTATIVE_CSV, 17),
    snapshotSanity: FIXTURE_SANITY,
  });

  const notModified = await ingestSbirAwardsCsv(store, {
    fetcher: async (input, init) => {
      assert.equal(String(input), SBIR_AWARDS_CSV_URL);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("if-none-match"), "\"sbir-snapshot-v1\"");
      assert.equal(headers.get("if-modified-since"), "Sat, 01 Aug 2026 00:00:00 GMT");
      return new Response(null, { status: 304 });
    },
    snapshotSanity: FIXTURE_SANITY,
  });
  assert.equal(notModified.status, "not-modified");

  await assert.rejects(
    ingestSbirAwardsCsv(store, {
      fetcher: async () => chunkedResponse("\"Wrong Header\"\n\"bad\"\n", 2),
      snapshotSanity: FIXTURE_SANITY,
    }),
    /required SBIR CSV columns/i,
  );
  assert.equal((await store.metadata())?.etag, "\"sbir-snapshot-v1\"");
  assert.equal((await store.getById("DE-AR0001984"))?.company, "AERODYNE RESEARCH INC");
});

test("SBIR keeps an honest empty fallback before a valid snapshot exists", async () => {
  const result = await searchSbirAwards("hydrogen", {
    store: new MemorySbirAwardsStore(),
  });

  assert.equal(result.status, "cached-fallback");
  assert.deepEqual(result.records, []);
  assert.match(result.warning ?? "", /no ingested SBIR/i);
});

test("SBIR blank and malformed award amounts remain unknown", async () => {
  const store = new MemorySbirAwardsStore();
  const csv = `${HEADER}\n`
    + "\"Blank Amount Co\",\"Blank amount research\",\"Agency\",\"Branch\",\"Phase I\",\"SBIR\",\"TRACK-1\",\"CONTRACT-1\",\"2026-01-01\",\"2026-06-01\",\"2026\",\"\"\n"
    + "\"Malformed Amount Co\",\"Malformed amount research\",\"Agency\",\"Branch\",\"Phase I\",\"SBIR\",\"TRACK-2\",\"CONTRACT-2\",\"2026-02-01\",\"2026-07-01\",\"2026\",\"not-an-amount\"\n";

  await ingestSbirAwardsCsv(store, {
    fetcher: async () => chunkedResponse(csv, 5),
    snapshotSanity: FIXTURE_SANITY,
  });

  const blank = await store.getById("CONTRACT-1");
  const malformed = await store.getById("CONTRACT-2");
  assert.equal(blank?.amount, undefined);
  assert.equal(malformed?.amount, undefined);
  assert.equal(blank?.recordKey, "CONTRACT-1:2026-01-01:unknown");
  assert.equal(malformed?.recordKey, "CONTRACT-2:2026-02-01:unknown");
});

test("SBIR rejects oversized and suspiciously truncated streams before commit", async () => {
  const store = new MemorySbirAwardsStore();
  await ingestSbirAwardsCsv(store, {
    fetcher: async () => chunkedResponse(REPRESENTATIVE_CSV, 9),
    snapshotSanity: FIXTURE_SANITY,
  });
  const originalMetadata = await store.metadata();
  const oneRecord = `${HEADER}\n`
    + "\"Only Co\",\"Only research\",\"Agency\",\"Branch\",\"Phase I\",\"SBIR\",\"TRACK-1\",\"CONTRACT-1\",\"2026-01-01\",\"2026-06-01\",\"2026\",\"100\"\n";

  await assert.rejects(
    ingestSbirAwardsCsv(store, {
      fetcher: async () => chunkedResponse(oneRecord, 3),
      snapshotSanity: {
        minimumInitialRecordCount: 1,
        minimumPreviousRecordRatio: 0.75,
      },
    }),
    /suspiciously truncated/i,
  );
  await assert.rejects(
    ingestSbirAwardsCsv(store, {
      fetcher: async () => chunkedResponse(REPRESENTATIVE_CSV, 4),
      maxCsvBytes: 32,
      snapshotSanity: FIXTURE_SANITY,
    }),
    /size limit/i,
  );

  assert.deepEqual(await store.metadata(), originalMetadata);
  assert.equal((await store.getById("DE-AR0001984"))?.company, "AERODYNE RESEARCH INC");
});

test("SBIR enforces the minimum first-snapshot sanity threshold", async () => {
  const store = new MemorySbirAwardsStore();
  const oneRecord = `${HEADER}\n`
    + "\"Only Co\",\"Only research\",\"Agency\",\"Branch\",\"Phase I\",\"SBIR\",\"TRACK-1\",\"CONTRACT-1\",\"2026-01-01\",\"2026-06-01\",\"2026\",\"100\"\n";

  await assert.rejects(
    ingestSbirAwardsCsv(store, {
      fetcher: async () => chunkedResponse(oneRecord, 6),
      snapshotSanity: {
        minimumInitialRecordCount: 2,
        minimumPreviousRecordRatio: 0.5,
      },
    }),
    /minimum first-snapshot/i,
  );
  assert.equal(await store.metadata(), null);
});
