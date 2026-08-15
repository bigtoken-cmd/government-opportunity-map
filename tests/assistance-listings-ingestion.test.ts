import assert from "node:assert/strict";
import test from "node:test";
import {
  ASSISTANCE_LISTINGS_CSV_URL,
  ingestAssistanceListingsCsv,
  normalizeAssistanceListingsCsv,
} from "../src/lib/sources/assistance-listings-ingestion";
import {
  MemoryAssistanceListingsStore,
} from "../src/lib/sources/assistance-listings-store";
import { searchAssistanceListings } from "../src/lib/sources/assistance-listings";

const HEADER = [
  "Program Title",
  "Program Number",
  "Federal Agency (030)",
  "Objectives (050)",
  "URL",
].map((value) => `"${value}"`).join(",");

const REPRESENTATIVE_CSV = `${HEADER}\r
"Trans-NIH ""Research"", Support","93.310","Department of Health and Human Services","Supports multimodal
health research.","https://sam.gov/fal/health/view"\r
"Title XVI Water Reclamation and Reuse Program","15.504","Department of the Interior","Supports water reuse and reclamation.","https://sam.gov/fal/water/view"\r
`;

function chunkedResponse(
  csv: string,
  chunkSize: number,
  headers: Record<string, string> = {},
) {
  const encoded = new TextEncoder().encode(csv);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < encoded.length; offset += chunkSize) {
        controller.enqueue(encoded.slice(offset, offset + chunkSize));
      }
      controller.close();
    },
  });
  const response = new Response(body, { headers });
  response.text = async () => {
    throw new Error("response.text() must not be used for streamed ingestion");
  };
  return response;
}

const FIXTURE_SANITY = {
  minimumInitialRecordCount: 1,
  minimumPreviousRecordRatio: 0.5,
};

test("CSV normalization supports quoted commas, escaped quotes, and multiline fields", () => {
  const records = normalizeAssistanceListingsCsv(REPRESENTATIVE_CSV);

  assert.equal(records.length, 2);
  assert.deepEqual(
    records.find((record) => record.assistanceListing === "93.310"),
    {
    assistanceListing: "93.310",
    title: "Trans-NIH \"Research\", Support",
    agency: "Department of Health and Human Services",
    objective: "Supports multimodal\nhealth research.",
    recordUrl: "https://sam.gov/fal/health/view",
    },
  );
  assert.equal(records[0].assistanceListing, "15.504");
});

test("scheduled ingestion replaces a compact snapshot used by ID and term lookup", async () => {
  const store = new MemoryAssistanceListingsStore();
  let fetchCount = 0;
  const result = await ingestAssistanceListingsCsv(store, {
    fetcher: async (input, init) => {
      fetchCount += 1;
      assert.equal(String(input), ASSISTANCE_LISTINGS_CSV_URL);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("accept"), "text/csv, application/octet-stream");
      return chunkedResponse(REPRESENTATIVE_CSV, 7, {
        etag: "\"assistance-snapshot-v1\"",
        "last-modified": "Sun, 09 Aug 2026 01:31:18 GMT",
      });
    },
    now: () => new Date("2026-08-14T12:00:00.000Z"),
    snapshotSanity: FIXTURE_SANITY,
  });

  assert.equal(fetchCount, 1);
  assert.equal(result.status, "updated");
  assert.deepEqual(result.metadata, {
    sourceUrl: ASSISTANCE_LISTINGS_CSV_URL,
    retrievedAt: "2026-08-14T12:00:00.000Z",
    lastModified: "2026-08-09T01:31:18.000Z",
    etag: "\"assistance-snapshot-v1\"",
    recordCount: 2,
  });
  assert.equal((await store.getById("15.504"))?.title, "Title XVI Water Reclamation and Reuse Program");
  assert.deepEqual(
    (await store.searchByTerms(["multimodal", "health"], 10))
      .map((record) => record.assistanceListing),
    ["93.310"],
  );

  const byId = await searchAssistanceListings(
    { assistanceListing: "93.310" },
    { store, now: () => new Date("2026-08-15T00:00:00.000Z") },
  );
  const byTerms = await searchAssistanceListings(
    { keyword: "water reuse" },
    { store, now: () => new Date("2026-08-15T00:00:00.000Z") },
  );

  assert.equal(fetchCount, 1);
  assert.equal(byId.status, "cached");
  assert.equal(byId.sourceUrl, ASSISTANCE_LISTINGS_CSV_URL);
  assert.equal(byId.records[0].kind, "program_context");
  assert.equal(byId.records[0].source.snapshotStatus, "cached_official_snapshot");
  assert.equal(byId.records[0].source.retrievedAt, "2026-08-14T12:00:00.000Z");
  assert.match(byId.records[0].source.note ?? "", /retrieved 2026-08-14/i);
  assert.match(byId.records[0].source.note ?? "", /last modified 2026-08-09/i);
  assert.deepEqual(
    byTerms.records.map((record) => record.assistanceListing),
    ["15.504"],
  );
});

test("missing or invalid ingested snapshots retain the audited fallback", async () => {
  const emptyStore = new MemoryAssistanceListingsStore();
  const noSnapshot = await searchAssistanceListings(
    { assistanceListing: "93.310" },
    { store: emptyStore },
  );
  assert.equal(noSnapshot.status, "cached-fallback");
  assert.equal(noSnapshot.records[0].assistanceListing, "93.310");

  await assert.rejects(
    ingestAssistanceListingsCsv(emptyStore, {
      fetcher: async () => new Response(
        "\"Wrong Header\",\"Program Number\"\n\"Bad\",\"93.310\"\n",
      ),
      snapshotSanity: FIXTURE_SANITY,
    }),
    /required Assistance Listings CSV columns/i,
  );
  assert.equal(await emptyStore.metadata(), null);
});

test("Assistance ingestion sends validators and treats 304 as unchanged success", async () => {
  const store = new MemoryAssistanceListingsStore();
  await ingestAssistanceListingsCsv(store, {
    fetcher: async () => chunkedResponse(REPRESENTATIVE_CSV, 11, {
      etag: "\"assistance-snapshot-v1\"",
      "last-modified": "Sun, 09 Aug 2026 01:31:18 GMT",
    }),
    snapshotSanity: FIXTURE_SANITY,
  });

  const result = await ingestAssistanceListingsCsv(store, {
    fetcher: async (_input, init) => {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("if-none-match"), "\"assistance-snapshot-v1\"");
      assert.equal(headers.get("if-modified-since"), "Sun, 09 Aug 2026 01:31:18 GMT");
      return new Response(null, { status: 304 });
    },
    snapshotSanity: FIXTURE_SANITY,
  });

  assert.equal(result.status, "not-modified");
  assert.equal(result.metadata.etag, "\"assistance-snapshot-v1\"");
  assert.equal((await store.getById("93.310"))?.title, "Trans-NIH \"Research\", Support");
});

test("Assistance ingestion rejects oversized and suspiciously truncated streams before commit", async () => {
  const store = new MemoryAssistanceListingsStore();
  await ingestAssistanceListingsCsv(store, {
    fetcher: async () => chunkedResponse(REPRESENTATIVE_CSV, 13, {
      etag: "\"assistance-snapshot-v1\"",
    }),
    snapshotSanity: FIXTURE_SANITY,
  });
  const originalMetadata = await store.metadata();
  const oneRecord = `${HEADER}\n"Only record","93.310","Agency","Objective","https://sam.gov/fal/one/view"\n`;

  await assert.rejects(
    ingestAssistanceListingsCsv(store, {
      fetcher: async () => chunkedResponse(oneRecord, 3, {
        etag: "\"assistance-snapshot-v2\"",
      }),
      snapshotSanity: {
        minimumInitialRecordCount: 1,
        minimumPreviousRecordRatio: 0.75,
      },
    }),
    /suspiciously truncated/i,
  );
  await assert.rejects(
    ingestAssistanceListingsCsv(store, {
      fetcher: async () => chunkedResponse(REPRESENTATIVE_CSV, 5),
      maxCsvBytes: 32,
      snapshotSanity: FIXTURE_SANITY,
    }),
    /size limit/i,
  );

  assert.deepEqual(await store.metadata(), originalMetadata);
  assert.equal((await store.getById("15.504"))?.title, "Title XVI Water Reclamation and Reuse Program");
});

test("Assistance ingestion enforces the minimum first-snapshot sanity threshold", async () => {
  const store = new MemoryAssistanceListingsStore();
  const oneRecord = `${HEADER}\n"Only record","93.310","Agency","Objective","https://sam.gov/fal/one/view"\n`;

  await assert.rejects(
    ingestAssistanceListingsCsv(store, {
      fetcher: async () => chunkedResponse(oneRecord, 4),
      snapshotSanity: {
        minimumInitialRecordCount: 2,
        minimumPreviousRecordRatio: 0.5,
      },
    }),
    /minimum first-snapshot/i,
  );
  assert.equal(await store.metadata(), null);
});
