import type {
  AssistanceListingEntry,
  AssistanceListingsSnapshotMetadata,
  AssistanceListingsStore,
} from "./assistance-listings-store";
import { CsvStreamParser, parseCsvRows } from "../csv";

export const ASSISTANCE_LISTINGS_CSV_URL =
  "https://s3.amazonaws.com/falextracts/Assistance%20Listings/datagov/AssistanceListings_DataGov_PUBLIC_CURRENT.csv";

const MAX_CSV_BYTES = 64 * 1024 * 1024;
const MIN_INITIAL_RECORD_COUNT = 1_000;
const MIN_PREVIOUS_RECORD_RATIO = 0.5;
const REQUIRED_COLUMNS = {
  title: "Program Title",
  assistanceListing: "Program Number",
  agency: "Federal Agency (030)",
  objective: "Objectives (050)",
  recordUrl: "URL",
} as const;

export type AssistanceListingsFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface AssistanceListingsIngestionOptions {
  fetcher?: AssistanceListingsFetcher;
  now?: () => Date;
  maxCsvBytes?: number;
  snapshotSanity?: {
    minimumInitialRecordCount?: number;
    minimumPreviousRecordRatio?: number;
  };
}

export type AssistanceListingsIngestionResult =
  | { status: "updated"; metadata: AssistanceListingsSnapshotMetadata }
  | { status: "not-modified"; metadata: AssistanceListingsSnapshotMetadata };

function validRecordUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "sam.gov"
      ? url.toString()
      : ASSISTANCE_LISTINGS_CSV_URL;
  } catch {
    return ASSISTANCE_LISTINGS_CSV_URL;
  }
}

function requiredColumnIndexes(header: readonly string[]) {
  const indexes = Object.fromEntries(
    Object.entries(REQUIRED_COLUMNS).map(([key, column]) => [key, header.indexOf(column)]),
  ) as Record<keyof typeof REQUIRED_COLUMNS, number>;
  const missingColumns = Object.entries(indexes)
    .filter(([, index]) => index < 0)
    .map(([key]) => REQUIRED_COLUMNS[key as keyof typeof REQUIRED_COLUMNS]);
  if (missingColumns.length > 0) {
    throw new Error(
      `Missing required Assistance Listings CSV columns: ${missingColumns.join(", ")}.`,
    );
  }
  return indexes;
}

function normalizeRow(
  row: readonly string[],
  indexes: Record<keyof typeof REQUIRED_COLUMNS, number>,
  headerLength: number,
): AssistanceListingEntry | null {
  if (row.every((value) => value.trim().length === 0)) return null;
  if (row.length !== headerLength) {
    throw new Error(
      `Malformed Assistance Listings CSV row: expected ${headerLength} fields, received ${row.length}.`,
    );
  }

  const assistanceListing = row[indexes.assistanceListing].trim();
  const title = row[indexes.title].trim();
  if (!/^\d{2}\.\d{3}$/.test(assistanceListing) || title.length === 0) {
    return null;
  }
  return {
    assistanceListing,
    title,
    agency: row[indexes.agency].trim(),
    objective: row[indexes.objective].trim(),
    recordUrl: validRecordUrl(row[indexes.recordUrl].trim()),
  };
}

function sortedRecords(recordsById: Map<string, AssistanceListingEntry>) {
  const records = [...recordsById.values()]
    .sort((left, right) => left.assistanceListing.localeCompare(right.assistanceListing));
  if (records.length === 0) {
    throw new Error("Assistance Listings CSV contained no valid public program records.");
  }
  return records;
}

export function normalizeAssistanceListingsCsv(input: string): AssistanceListingEntry[] {
  const rows = parseCsvRows(input.replace(/^\uFEFF/, ""));
  const header = rows[0];
  if (!header) {
    throw new Error("Assistance Listings CSV is empty.");
  }
  const indexes = requiredColumnIndexes(header);
  const recordsById = new Map<string, AssistanceListingEntry>();
  for (const row of rows.slice(1)) {
    const record = normalizeRow(row, indexes, header.length);
    if (record) recordsById.set(record.assistanceListing, record);
  }
  return sortedRecords(recordsById);
}

function normalizedTimestamp(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function conditionalHeaders(metadata: AssistanceListingsSnapshotMetadata | null) {
  const headers = new Headers({
    Accept: "text/csv, application/octet-stream",
  });
  if (metadata?.etag) headers.set("If-None-Match", metadata.etag);
  if (metadata?.lastModified) {
    headers.set("If-Modified-Since", new Date(metadata.lastModified).toUTCString());
  }
  return headers;
}

function snapshotSanity(
  recordCount: number,
  previous: AssistanceListingsSnapshotMetadata | null,
  options: AssistanceListingsIngestionOptions,
) {
  const minimumInitialRecordCount =
    options.snapshotSanity?.minimumInitialRecordCount ?? MIN_INITIAL_RECORD_COUNT;
  const minimumPreviousRecordRatio =
    options.snapshotSanity?.minimumPreviousRecordRatio ?? MIN_PREVIOUS_RECORD_RATIO;
  if (
    !Number.isInteger(minimumInitialRecordCount)
    || minimumInitialRecordCount < 1
    || !Number.isFinite(minimumPreviousRecordRatio)
    || minimumPreviousRecordRatio <= 0
    || minimumPreviousRecordRatio > 1
  ) {
    throw new Error("Assistance Listings snapshot sanity configuration is invalid.");
  }
  if (!previous && recordCount < minimumInitialRecordCount) {
    throw new Error(
      `Assistance Listings snapshot is below the minimum first-snapshot record count of ${minimumInitialRecordCount}.`,
    );
  }
  if (
    previous
    && recordCount < Math.ceil(previous.recordCount * minimumPreviousRecordRatio)
  ) {
    throw new Error("Assistance Listings snapshot is suspiciously truncated.");
  }
}

export async function ingestAssistanceListingsCsv(
  store: AssistanceListingsStore,
  options: AssistanceListingsIngestionOptions = {},
): Promise<AssistanceListingsIngestionResult> {
  const existingMetadata = await store.metadata();
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(ASSISTANCE_LISTINGS_CSV_URL, {
    cache: "no-store",
    headers: conditionalHeaders(existingMetadata),
  });
  if (response.status === 304) {
    if (!existingMetadata) {
      throw new Error(
        "Assistance Listings CSV returned not modified without an existing snapshot.",
      );
    }
    return { status: "not-modified", metadata: existingMetadata };
  }
  if (!response.ok) {
    throw new Error(`Assistance Listings CSV request failed with HTTP ${response.status}.`);
  }

  const maxCsvBytes = options.maxCsvBytes ?? MAX_CSV_BYTES;
  if (!Number.isFinite(maxCsvBytes) || maxCsvBytes < 1) {
    throw new Error("Assistance Listings ingestion size configuration is invalid.");
  }
  const contentLength = response.headers.get("content-length");
  const declaredLength = contentLength === null ? Number.NaN : Number(contentLength);
  if (Number.isFinite(declaredLength) && declaredLength > maxCsvBytes) {
    throw new Error("Assistance Listings CSV exceeds the ingestion size limit.");
  }
  if (!response.body) {
    throw new Error("Assistance Listings CSV response did not provide a streaming body.");
  }

  const parser = new CsvStreamParser();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  const recordsById = new Map<string, AssistanceListingEntry>();
  let indexes: Record<keyof typeof REQUIRED_COLUMNS, number> | null = null;
  let headerLength = 0;
  let bytesRead = 0;

  const consumeRows = (rows: readonly string[][]) => {
    for (const rawRow of rows) {
      const row = indexes
        ? rawRow
        : rawRow.map((value, index) => index === 0 ? value.replace(/^\uFEFF/, "") : value);
      if (!indexes) {
        indexes = requiredColumnIndexes(row);
        headerLength = row.length;
        continue;
      }
      const record = normalizeRow(row, indexes, headerLength);
      if (record) recordsById.set(record.assistanceListing, record);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxCsvBytes) {
        throw new Error("Assistance Listings CSV exceeds the ingestion size limit.");
      }
      consumeRows(parser.push(decoder.decode(value, { stream: true })));
    }
    consumeRows(parser.push(decoder.decode()));
    consumeRows(parser.finish());
    if (!indexes) throw new Error("Assistance Listings CSV is empty.");

    const records = sortedRecords(recordsById);
    snapshotSanity(records.length, existingMetadata, options);
    const metadata = {
      sourceUrl: ASSISTANCE_LISTINGS_CSV_URL,
      retrievedAt: (options.now ?? (() => new Date()))().toISOString(),
      lastModified: normalizedTimestamp(response.headers.get("last-modified")),
      etag: response.headers.get("etag"),
      recordCount: records.length,
    } satisfies AssistanceListingsSnapshotMetadata;
    await store.replaceSnapshot(metadata, records);
    return { status: "updated", metadata };
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
