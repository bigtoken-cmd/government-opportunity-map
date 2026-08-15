import { CsvStreamParser } from "../csv";
import type {
  SbirAwardsSnapshotMetadata,
  SbirAwardsStore,
  SbirHistoricalAwardEntry,
} from "./sbir-store";

export const SBIR_AWARDS_CSV_URL =
  "https://data.www.sbir.gov/mod_awarddatapublic_no_abstract/award_data_no_abstract.csv";

const SBIR_AWARDS_PAGE_URL = "https://www.sbir.gov/awards";
const MAX_CSV_BYTES = 256 * 1024 * 1024;
const MIN_INITIAL_RECORD_COUNT = 10_000;
const MIN_PREVIOUS_RECORD_RATIO = 0.5;
const REQUIRED_COLUMNS = {
  company: "Company",
  title: "Award Title",
  agency: "Agency",
  branch: "Branch",
  phase: "Phase",
  program: "Program",
  agencyTrackingNumber: "Agency Tracking Number",
  contract: "Contract",
  startDate: "Proposal Award Date",
  endDate: "Contract End Date",
  awardYear: "Award Year",
  amount: "Award Amount",
} as const;
const RESEARCH_KEYWORD_STOP_WORDS = new Set([
  "and",
  "for",
  "from",
  "into",
  "method",
  "system",
  "the",
  "this",
  "through",
  "using",
  "with",
]);

export type SbirAwardsFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface SbirAwardsIngestionOptions {
  fetcher?: SbirAwardsFetcher;
  now?: () => Date;
  maxCsvBytes?: number;
  snapshotSanity?: {
    minimumInitialRecordCount?: number;
    minimumPreviousRecordRatio?: number;
  };
}

export type SbirAwardsIngestionResult =
  | { status: "updated"; metadata: SbirAwardsSnapshotMetadata }
  | { status: "not-modified"; metadata: SbirAwardsSnapshotMetadata };

function normalizedTimestamp(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function researchKeywords(title: string) {
  return [...new Set(
    title
      .toLocaleLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 3 && !RESEARCH_KEYWORD_STOP_WORDS.has(term)),
  )];
}

function awardUrl(awardId: string) {
  const url = new URL(SBIR_AWARDS_PAGE_URL);
  url.searchParams.set("keywords", awardId);
  return url.toString();
}

function amount(value: string) {
  const normalized = value.trim().replace(/[$,]/g, "");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function requiredColumnIndexes(header: readonly string[]) {
  const indexes = Object.fromEntries(
    Object.entries(REQUIRED_COLUMNS).map(([key, column]) => [key, header.indexOf(column)]),
  ) as Record<keyof typeof REQUIRED_COLUMNS, number>;
  const missingColumns = Object.entries(indexes)
    .filter(([, index]) => index < 0)
    .map(([key]) => REQUIRED_COLUMNS[key as keyof typeof REQUIRED_COLUMNS]);
  if (missingColumns.length > 0) {
    throw new Error(`Missing required SBIR CSV columns: ${missingColumns.join(", ")}.`);
  }
  return indexes;
}

function normalizeRow(
  row: readonly string[],
  indexes: Record<keyof typeof REQUIRED_COLUMNS, number>,
): SbirHistoricalAwardEntry | null {
  const sourceId = (
    row[indexes.contract].trim()
    || row[indexes.agencyTrackingNumber].trim()
  );
  const title = row[indexes.title].trim();
  const company = row[indexes.company].trim();
  if (!sourceId || !title || !company) return null;
  const startDate = row[indexes.startDate].trim();
  const awardYear = row[indexes.awardYear].trim();
  const awardAmount = amount(row[indexes.amount]);

  return {
    recordKey: `${sourceId}:${startDate || awardYear}:${awardAmount ?? "unknown"}`,
    awardId: sourceId,
    awardUrl: awardUrl(sourceId),
    title,
    agency: row[indexes.agency].trim(),
    branch: row[indexes.branch].trim(),
    program: row[indexes.program].trim(),
    phase: row[indexes.phase].trim(),
    startDate,
    endDate: row[indexes.endDate].trim(),
    awardYear,
    amount: awardAmount,
    company,
    researchKeywords: researchKeywords(title),
  };
}

function conditionalHeaders(metadata: SbirAwardsSnapshotMetadata | null) {
  const headers = new Headers({
    Accept: "text/csv, application/octet-stream",
  });
  if (metadata?.etag) {
    headers.set("If-None-Match", metadata.etag);
  }
  if (metadata?.lastModified) {
    headers.set("If-Modified-Since", new Date(metadata.lastModified).toUTCString());
  }
  return headers;
}

function snapshotSanity(
  recordCount: number,
  previous: SbirAwardsSnapshotMetadata | null,
  options: SbirAwardsIngestionOptions,
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
    throw new Error("SBIR snapshot sanity configuration is invalid.");
  }
  if (!previous && recordCount < minimumInitialRecordCount) {
    throw new Error(
      `SBIR snapshot is below the minimum first-snapshot record count of ${minimumInitialRecordCount}.`,
    );
  }
  if (
    previous
    && recordCount < Math.ceil(previous.recordCount * minimumPreviousRecordRatio)
  ) {
    throw new Error("SBIR snapshot is suspiciously truncated.");
  }
}

export async function ingestSbirAwardsCsv(
  store: SbirAwardsStore,
  options: SbirAwardsIngestionOptions = {},
): Promise<SbirAwardsIngestionResult> {
  const existingMetadata = await store.metadata();
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(SBIR_AWARDS_CSV_URL, {
    cache: "no-store",
    headers: conditionalHeaders(existingMetadata),
  });

  if (response.status === 304) {
    if (!existingMetadata) {
      throw new Error("SBIR CSV returned not modified without an existing snapshot.");
    }
    return { status: "not-modified", metadata: existingMetadata };
  }
  if (!response.ok) {
    throw new Error(`SBIR CSV request failed with HTTP ${response.status}.`);
  }
  const maxCsvBytes = options.maxCsvBytes ?? MAX_CSV_BYTES;
  if (!Number.isFinite(maxCsvBytes) || maxCsvBytes < 1) {
    throw new Error("SBIR ingestion size configuration is invalid.");
  }
  const contentLength = response.headers.get("content-length");
  const declaredLength = contentLength === null ? Number.NaN : Number(contentLength);
  if (Number.isFinite(declaredLength) && declaredLength > maxCsvBytes) {
    throw new Error("SBIR CSV exceeds the ingestion size limit.");
  }
  if (!response.body) {
    throw new Error("SBIR CSV response did not provide a streaming body.");
  }

  const writer = await store.beginSnapshot();
  const parser = new CsvStreamParser();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let indexes: Record<keyof typeof REQUIRED_COLUMNS, number> | null = null;
  let headerLength = 0;
  let recordCount = 0;
  let bytesRead = 0;

  const consumeRows = async (rows: readonly string[][]) => {
    for (const rawRow of rows) {
      const row = indexes
        ? rawRow
        : rawRow.map((value, index) => index === 0 ? value.replace(/^\uFEFF/, "") : value);
      if (!indexes) {
        indexes = requiredColumnIndexes(row);
        headerLength = row.length;
        continue;
      }
      if (row.every((value) => value.trim().length === 0)) continue;
      if (row.length !== headerLength) {
        throw new Error(
          `Malformed SBIR CSV row: expected ${headerLength} fields, received ${row.length}.`,
        );
      }
      const record = normalizeRow(row, indexes);
      if (record && await writer.write(record)) {
        recordCount += 1;
      }
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxCsvBytes) {
        throw new Error("SBIR CSV exceeds the ingestion size limit.");
      }
      await consumeRows(parser.push(decoder.decode(value, { stream: true })));
    }
    await consumeRows(parser.push(decoder.decode()));
    await consumeRows(parser.finish());
    if (!indexes || recordCount === 0) {
      throw new Error("SBIR CSV contained no valid historical award records.");
    }
    snapshotSanity(recordCount, existingMetadata, options);

    const metadata = {
      sourceUrl: SBIR_AWARDS_CSV_URL,
      retrievedAt: (options.now ?? (() => new Date()))().toISOString(),
      lastModified: normalizedTimestamp(response.headers.get("last-modified")),
      etag: response.headers.get("etag"),
      recordCount,
    } satisfies SbirAwardsSnapshotMetadata;
    await writer.commit(metadata);
    return { status: "updated", metadata };
  } catch (error) {
    await writer.abort();
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
