export interface AssistanceListingEntry {
  assistanceListing: string;
  title: string;
  agency: string;
  objective: string;
  recordUrl: string;
}

export interface AssistanceListingsSnapshotMetadata {
  sourceUrl: string;
  retrievedAt: string;
  lastModified: string | null;
  etag: string | null;
  recordCount: number;
}

export interface AssistanceListingsStore {
  replaceSnapshot(
    metadata: AssistanceListingsSnapshotMetadata,
    records: readonly AssistanceListingEntry[],
  ): Promise<void>;
  metadata(): Promise<AssistanceListingsSnapshotMetadata | null>;
  getById(assistanceListing: string): Promise<AssistanceListingEntry | null>;
  searchByTerms(
    terms: readonly string[],
    limit: number,
  ): Promise<AssistanceListingEntry[]>;
}

function normalizeListingId(value: string) {
  return value.trim().toLocaleLowerCase();
}

function normalizeSearchTerm(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function copyEntry(record: AssistanceListingEntry): AssistanceListingEntry {
  return { ...record };
}

export class MemoryAssistanceListingsStore implements AssistanceListingsStore {
  #metadata: AssistanceListingsSnapshotMetadata | null = null;
  #records: AssistanceListingEntry[] = [];
  #recordsById = new Map<string, AssistanceListingEntry>();

  async replaceSnapshot(
    metadata: AssistanceListingsSnapshotMetadata,
    records: readonly AssistanceListingEntry[],
  ) {
    if (metadata.recordCount !== records.length) {
      throw new Error("Assistance Listings snapshot record count does not match metadata.");
    }

    const nextRecords = records.map(copyEntry);
    const nextRecordsById = new Map<string, AssistanceListingEntry>();
    for (const record of nextRecords) {
      nextRecordsById.set(normalizeListingId(record.assistanceListing), record);
    }

    this.#records = nextRecords;
    this.#recordsById = nextRecordsById;
    this.#metadata = { ...metadata };
  }

  async metadata() {
    return this.#metadata ? { ...this.#metadata } : null;
  }

  async getById(assistanceListing: string) {
    const record = this.#recordsById.get(normalizeListingId(assistanceListing));
    return record ? copyEntry(record) : null;
  }

  async searchByTerms(terms: readonly string[], limit: number) {
    const normalizedTerms = [...new Set(
      terms.map(normalizeSearchTerm).filter((term) => term.length >= 2),
    )];
    if (normalizedTerms.length === 0 || limit <= 0) {
      return [];
    }

    return this.#records
      .map((record) => {
        const listing = normalizeListingId(record.assistanceListing);
        const title = normalizeSearchTerm(record.title);
        const agency = normalizeSearchTerm(record.agency);
        const objective = normalizeSearchTerm(record.objective);
        const score = normalizedTerms.reduce((total, term) => {
          if (listing === term) return total + 20;
          if (title.includes(term)) return total + 6;
          if (objective.includes(term)) return total + 3;
          if (agency.includes(term)) return total + 1;
          return total;
        }, 0);
        return { record, score };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => (
        right.score - left.score
        || left.record.assistanceListing.localeCompare(right.record.assistanceListing)
      ))
      .slice(0, limit)
      .map(({ record }) => copyEntry(record));
  }
}
