export class CsvStreamParser {
  #field = "";
  #row: string[] = [];
  #inQuotes = false;
  #quotePending = false;
  #quotedFieldClosed = false;
  #pendingCarriageReturn = false;

  push(chunk: string): string[][] {
    const rows: string[][] = [];

    for (const character of chunk) {
      if (this.#pendingCarriageReturn) {
        this.#pendingCarriageReturn = false;
        if (character === "\n") continue;
      }

      if (this.#inQuotes) {
        if (this.#quotePending) {
          if (character === "\"") {
            this.#field += "\"";
            this.#quotePending = false;
            continue;
          }
          this.#inQuotes = false;
          this.#quotePending = false;
          this.#quotedFieldClosed = true;
        } else if (character === "\"") {
          this.#quotePending = true;
          continue;
        } else {
          this.#field += character;
          continue;
        }
      }

      if (this.#quotedFieldClosed) {
        if (character === ",") {
          this.#finishField();
        } else if (character === "\n" || character === "\r") {
          this.#finishRow(rows);
          this.#pendingCarriageReturn = character === "\r";
        } else {
          throw new Error("Malformed CSV: unexpected character after a quoted field.");
        }
        continue;
      }

      if (character === "\"") {
        if (this.#field.length > 0) {
          throw new Error("Malformed CSV: quote inside an unquoted field.");
        }
        this.#inQuotes = true;
      } else if (character === ",") {
        this.#finishField();
      } else if (character === "\n" || character === "\r") {
        this.#finishRow(rows);
        this.#pendingCarriageReturn = character === "\r";
      } else {
        this.#field += character;
      }
    }

    return rows;
  }

  finish(): string[][] {
    if (this.#quotePending) {
      this.#quotePending = false;
      this.#inQuotes = false;
      this.#quotedFieldClosed = true;
    } else if (this.#inQuotes) {
      throw new Error("Malformed CSV: unterminated quoted field.");
    }

    const rows: string[][] = [];
    if (this.#field.length > 0 || this.#row.length > 0 || this.#quotedFieldClosed) {
      this.#finishRow(rows);
    }
    return rows;
  }

  #finishField() {
    this.#row.push(this.#field);
    this.#field = "";
    this.#quotedFieldClosed = false;
  }

  #finishRow(rows: string[][]) {
    this.#finishField();
    rows.push(this.#row);
    this.#row = [];
  }
}

export function parseCsvRows(input: string) {
  const parser = new CsvStreamParser();
  return [...parser.push(input), ...parser.finish()];
}
