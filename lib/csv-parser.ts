/**
 * Tiny dependency-free CSV parser (RFC 4180-ish).
 *
 * The app already *writes* CSV in lib/export.ts with the same quoting rules
 * (double-quote wrap when a value contains `" , \n`, `""` to escape a quote).
 * This is the reading half, kept deliberately small so we don't pull in a
 * dependency for the bulk-roster import.
 *
 * It streams the source char-by-char through a small state machine so it
 * correctly handles quoted fields that themselves contain commas, newlines, or
 * escaped quotes — and it remembers the *source line* each record started on so
 * validation can report "Row 5: …" against the file the admin actually uploaded.
 */

export interface CsvRow {
  /** 1-based source line where this record began (the header is line 1). */
  line: number;
  /** Values keyed by (trimmed) header name. Missing columns resolve to "". */
  cells: Record<string, string>;
  /** How many raw fields the record had — lets validation flag ragged rows. */
  fieldCount: number;
}

export interface ParsedCsv {
  /** Header names, trimmed, in source order. */
  headers: string[];
  rows: CsvRow[];
}

/** Thrown for structurally broken input (e.g. an unterminated quote). */
export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvParseError";
  }
}

/** Split raw text into records of string fields, tracking each record's start line. */
function tokenize(text: string): { fields: string[]; line: number }[] {
  // Strip a leading UTF-8 BOM (Excel loves to add one).
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records: { fields: string[]; line: number }[] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let line = 1; // current source line
  let recordStart = 1; // line the in-progress record began on
  let touched = false; // has the current record seen any content at all?

  const endField = () => {
    record.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    records.push({ fields: record, line: recordStart });
    record = [];
    touched = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false; // closing quote
        }
      } else {
        if (c === "\n") line++;
        field += c;
      }
      continue;
    }

    if (c === '"') {
      if (!touched) recordStart = line;
      touched = true;
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      if (!touched) recordStart = line;
      touched = true;
      endField();
      continue;
    }
    if (c === "\r") continue; // normalise CRLF
    if (c === "\n") {
      if (touched || record.length > 0) endRecord();
      // else: a blank line — skip it entirely.
      line++;
      continue;
    }
    // any other char
    if (!touched) recordStart = line;
    touched = true;
    field += c;
  }

  if (inQuotes) {
    throw new CsvParseError("Malformed CSV: a quoted value is never closed.");
  }
  // Flush a trailing record with no closing newline.
  if (touched || field.length > 0 || record.length > 0) endRecord();

  return records;
}

/**
 * Parse CSV text into headers + rows. Header names and cell values are trimmed.
 * Throws {@link CsvParseError} for empty input or structurally broken quoting.
 */
export function parseCsv(text: string): ParsedCsv {
  const records = tokenize(text);
  if (records.length === 0) {
    throw new CsvParseError("The file is empty.");
  }

  const headers = records[0].fields.map((h) => h.trim());
  if (headers.every((h) => h === "")) {
    throw new CsvParseError("The first row has no column headers.");
  }

  const rows: CsvRow[] = records.slice(1).map((rec) => {
    const cells: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h === "") return; // ignore unnamed columns
      cells[h] = (rec.fields[idx] ?? "").trim();
    });
    return { line: rec.line, cells, fieldCount: rec.fields.length };
  });

  return { headers, rows };
}
