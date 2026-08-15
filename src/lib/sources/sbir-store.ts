export interface SbirHistoricalAwardEntry {
  recordKey: string;
  awardId: string;
  awardUrl: string;
  title: string;
  agency: string;
  branch: string;
  program: string;
  phase: string;
  startDate: string;
  endDate: string;
  awardYear: string;
  amount?: number;
  company: string;
  researchKeywords: readonly string[];
}

export interface SbirAwardsSnapshotMetadata {
  sourceUrl: string;
  retrievedAt: string;
  lastModified: string | null;
  etag: string | null;
  recordCount: number;
}

export interface SbirSnapshotWriter {
  write(record: SbirHistoricalAwardEntry): Promise<boolean>;
  commit(metadata: SbirAwardsSnapshotMetadata): Promise<void>;
  abort(): Promise<void>;
}

export interface SbirAwardsStore {
  metadata(): Promise<SbirAwardsSnapshotMetadata | null>;
  beginSnapshot(): Promise<SbirSnapshotWriter>;
  getById(awardId: string): Promise<SbirHistoricalAwardEntry | null>;
  searchByTerms(
    terms: readonly string[],
    limit: number,
  ): Promise<SbirHistoricalAwardEntry[]>;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function copyEntry(record: SbirHistoricalAwardEntry): SbirHistoricalAwardEntry {
  return {
    ...record,
    researchKeywords: [...record.researchKeywords],
  };
}

export class MemorySbirAwardsStore implements SbirAwardsStore {
  #metadata: SbirAwardsSnapshotMetadata | null = null;
  #records = new Map<string, SbirHistoricalAwardEntry>();

  async metadata() {
    return this.#metadata ? { ...this.#metadata } : null;
  }

  async beginSnapshot(): Promise<SbirSnapshotWriter> {
    const staged = new Map<string, SbirHistoricalAwardEntry>();
    let finished = false;

    return {
      write: async (record) => {
        if (finished) throw new Error("SBIR snapshot writer is already closed.");
        const key = normalize(record.recordKey);
        const inserted = !staged.has(key);
        staged.set(key, copyEntry(record));
        return inserted;
      },
      commit: async (metadata) => {
        if (finished) throw new Error("SBIR snapshot writer is already closed.");
        if (metadata.recordCount !== staged.size) {
          throw new Error("SBIR snapshot record count does not match metadata.");
        }
        this.#records = staged;
        this.#metadata = { ...metadata };
        finished = true;
      },
      abort: async () => {
        finished = true;
        staged.clear();
      },
    };
  }

  async getById(awardId: string) {
    const normalizedAwardId = normalize(awardId);
    const record = [...this.#records.values()]
      .filter((candidate) => normalize(candidate.awardId) === normalizedAwardId)
      .sort((left, right) => right.startDate.localeCompare(left.startDate))[0];
    return record ? copyEntry(record) : null;
  }

  async searchByTerms(terms: readonly string[], limit: number) {
    const normalizedTerms = [...new Set(
      terms.map(normalize).filter((term) => term.length >= 2),
    )];
    if (normalizedTerms.length === 0 || limit <= 0) {
      return [];
    }

    return [...this.#records.values()]
      .map((record) => {
        const title = normalize(record.title);
        const agency = normalize(`${record.agency} ${record.branch}`);
        const company = normalize(record.company);
        const program = normalize(`${record.program} ${record.phase}`);
        const keywords = normalize(record.researchKeywords.join(" "));
        const score = normalizedTerms.reduce((total, term) => {
          if (title.includes(term)) return total + 8;
          if (keywords.includes(term)) return total + 5;
          if (company.includes(term)) return total + 3;
          if (agency.includes(term)) return total + 2;
          if (program.includes(term)) return total + 1;
          return total;
        }, 0);
        return { record, score };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => (
        right.score - left.score
        || right.record.startDate.localeCompare(left.record.startDate)
        || left.record.awardId.localeCompare(right.record.awardId)
      ))
      .slice(0, limit)
      .map(({ record }) => copyEntry(record));
  }
}
