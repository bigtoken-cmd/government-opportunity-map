import JSZip, { type JSZipObject } from "jszip";

export type IntakeUploadType = "pdf" | "docx" | "pptx";
export type IntakeExtractionStatus = "extracted" | "provided-text" | "needs-paste" | "unsupported";
export type IntakeTextOrigin = "server-retrieved" | "server-extracted" | "user-supplied" | "none";

export interface IntakeSourceSummary {
  id: string;
  type: "website" | "manual" | IntakeUploadType;
  displayName: string;
  sourceUrl: string;
  extractionStatus: IntakeExtractionStatus;
  textOrigin: IntakeTextOrigin;
  extractedCharacterCount: number;
  message?: string;
}

export interface UploadLike {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ExtractedUpload {
  summary: IntakeSourceSummary;
  text: string;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_PDF_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_RELEVANT_XML_BYTES = 2 * 1024 * 1024;
const MAX_RELEVANT_ARCHIVE_TOTAL_BYTES = 8 * 1024 * 1024;
const MAX_EXTRACTED_CHARACTERS = 8_000;
const MAX_SLIDES = 100;
const MAX_PDF_PAGES = 50;
const MAX_PDF_TEXT_ITEMS = 20_000;
const PDF_EXTRACTION_TIMEOUT_MS = 8_000;

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

function decodeXml(value: string) {
  return value
    .replace(/&#(\d+);/g, (entity, code: string) => {
      const numeric = Number(code);
      return Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff
        ? String.fromCodePoint(numeric)
        : entity;
    })
    .replace(/&#x([0-9a-f]+);/gi, (entity, code: string) => {
      const numeric = Number.parseInt(code, 16);
      return Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff
        ? String.fromCodePoint(numeric)
        : entity;
    })
    .replace(/&([a-z]+);/gi, (entity, name: string) => XML_ENTITIES[name] ?? entity);
}

function cleanExtractedText(value: string) {
  return decodeXml(value)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_EXTRACTED_CHARACTERS);
}

async function extractPdf(bytes: ArrayBuffer) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  let destroyLoadingTask: (() => Promise<void>) | undefined;
  let timeoutDestruction: Promise<void> | undefined;
  const extraction = (async () => {
    const { getDocument } = await import("unpdf/pdfjs");
    if (cancelled) throw new Error("PDF extraction timed out.");
    const documentOptions = {
      data: new Uint8Array(bytes),
      disableAutoFetch: true,
      isEvalSupported: false,
      maxImageSize: 1_000_000,
      stopAtErrors: true,
    };
    const loadingTask = getDocument(documentOptions);
    let destroyed = false;
    destroyLoadingTask = async () => {
      if (destroyed) return;
      destroyed = true;
      await loadingTask.destroy();
    };
    try {
      const document = await loadingTask.promise;
      if (document.numPages > MAX_PDF_PAGES) {
        throw new Error(`PDF files over ${MAX_PDF_PAGES} pages require pasted text.`);
      }
      const fragments: string[] = [];
      let characterCount = 0;
      let textItemCount = 0;
      for (
        let pageNumber = 1;
        pageNumber <= document.numPages && characterCount < MAX_EXTRACTED_CHARACTERS;
        pageNumber += 1
      ) {
        const pdfPage = await document.getPage(pageNumber);
        try {
          const reader = pdfPage.streamTextContent().getReader();
          try {
            while (
              characterCount < MAX_EXTRACTED_CHARACTERS
              && textItemCount < MAX_PDF_TEXT_ITEMS
            ) {
              const { done, value } = await reader.read();
              if (done) break;
              for (const item of value.items) {
                if (!("str" in item) || !item.str.trim()) continue;
                const separator = item.hasEOL ? "\n" : " ";
                fragments.push(item.str, separator);
                characterCount += item.str.length + separator.length;
                textItemCount += 1;
                if (
                  characterCount >= MAX_EXTRACTED_CHARACTERS
                  || textItemCount >= MAX_PDF_TEXT_ITEMS
                ) break;
              }
            }
          } finally {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
          }
        } finally {
          pdfPage.cleanup();
        }
        if (textItemCount >= MAX_PDF_TEXT_ITEMS) break;
      }
      return cleanExtractedText(fragments.join(""));
    } finally {
      await destroyLoadingTask();
    }
  })();
  const timeoutFailure = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      cancelled = true;
      timeoutDestruction = destroyLoadingTask?.().catch(() => undefined);
      reject(new Error("PDF extraction timed out."));
    }, PDF_EXTRACTION_TIMEOUT_MS);
  });
  try {
    return await Promise.race([extraction, timeoutFailure]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    if (timeoutDestruction) await timeoutDestruction;
  }
}

function extractTaggedText(xml: string, tag: "w:t" | "a:t", paragraphTag: "w:p" | "a:p") {
  const withBreaks = xml
    .replace(new RegExp(`<\\/${paragraphTag}>`, "gi"), "\n")
    .replace(/<(?:w:br|w:tab|a:br)\b[^>]*\/?\s*>/gi, " ");
  const values = [...withBreaks.matchAll(
    new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"),
  )].map((match) => match[1]);
  return cleanExtractedText(values.join(" ").replace(/ \n /g, "\n"));
}

function uploadType(file: UploadLike): IntakeUploadType | null {
  const lowerName = file.name.trim().toLocaleLowerCase("en-US");
  if (lowerName.endsWith(".pdf")) return "pdf";
  if (lowerName.endsWith(".docx")) return "docx";
  if (lowerName.endsWith(".pptx")) return "pptx";
  return null;
}

function endOfCentralDirectory(view: DataView) {
  const minimumOffset = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

function assertSafeOfficeArchive(bytes: ArrayBuffer, type: "docx" | "pptx") {
  const view = new DataView(bytes);
  const endOffset = endOfCentralDirectory(view);
  if (endOffset < 0) throw new Error("The document archive is invalid.");
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  if (
    entryCount === 0xffff
    || centralSize === 0xffffffff
    || centralOffset === 0xffffffff
    || centralOffset + centralSize > endOffset
  ) {
    throw new Error("ZIP64 or malformed office archives are not supported.");
  }

  let offset = centralOffset;
  let relevantUncompressedBytes = 0;
  const decoder = new TextDecoder();
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("The document archive directory is invalid.");
    }
    const uncompressedSize = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const entryEnd = offset + 46 + fileNameLength + extraLength + commentLength;
    if (entryEnd > view.byteLength) {
      throw new Error("The document archive directory is invalid.");
    }
    const fileName = decoder.decode(new Uint8Array(bytes, offset + 46, fileNameLength));
    const relevant = type === "docx"
      ? fileName === "word/document.xml"
      : /^ppt\/slides\/slide\d+\.xml$/i.test(fileName);
    if (relevant) {
      if (uncompressedSize > MAX_RELEVANT_XML_BYTES) {
        throw new Error("The document contains an unusually large text part.");
      }
      relevantUncompressedBytes += uncompressedSize;
      if (relevantUncompressedBytes > MAX_RELEVANT_ARCHIVE_TOTAL_BYTES) {
        throw new Error("The document contains too much expanded slide text.");
      }
    }
    offset = entryEnd;
  }
  if (offset > centralOffset + centralSize) {
    throw new Error("The document archive directory is invalid.");
  }
}

interface ZipStreamHelper {
  on(event: "data", callback: (chunk: Uint8Array) => void): ZipStreamHelper;
  on(event: "end", callback: () => void): ZipStreamHelper;
  on(event: "error", callback: (error: Error) => void): ZipStreamHelper;
  pause(): ZipStreamHelper;
  resume(): ZipStreamHelper;
}

interface StreamableZipObject extends JSZipObject {
  internalStream(type: "uint8array"): ZipStreamHelper;
}

interface ExpansionBudget {
  usedBytes: number;
}

async function safeXml(entry: JSZipObject, budget: ExpansionBudget) {
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let entryBytes = 0;
    let settled = false;
    const stream = (entry as StreamableZipObject).internalStream("uint8array");
    stream.on("data", (chunk) => {
      if (settled) return;
      entryBytes += chunk.byteLength;
      if (
        entryBytes > MAX_RELEVANT_XML_BYTES
        || budget.usedBytes + entryBytes > MAX_RELEVANT_ARCHIVE_TOTAL_BYTES
      ) {
        settled = true;
        stream.pause();
        reject(new Error("The document contains too much expanded text."));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    stream.on("end", () => {
      if (settled) return;
      settled = true;
      budget.usedBytes += entryBytes;
      const combined = new Uint8Array(entryBytes);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(combined);
    });
    stream.resume();
  });
  return new TextDecoder().decode(bytes);
}

async function extractDocx(bytes: ArrayBuffer) {
  assertSafeOfficeArchive(bytes, "docx");
  const zip = await JSZip.loadAsync(bytes, {
    checkCRC32: false,
    createFolders: false,
  });
  const document = zip.file("word/document.xml");
  if (!document) throw new Error("The DOCX body could not be found.");
  return extractTaggedText(
    await safeXml(document, { usedBytes: 0 }),
    "w:t",
    "w:p",
  );
}

function slideNumber(path: string) {
  const match = path.match(/slide(\d+)\.xml$/i);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

async function extractPptx(bytes: ArrayBuffer) {
  assertSafeOfficeArchive(bytes, "pptx");
  const zip = await JSZip.loadAsync(bytes, {
    checkCRC32: false,
    createFolders: false,
  });
  const slides = Object.values(zip.files)
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .sort((left, right) => slideNumber(left.name) - slideNumber(right.name));
  if (!slides.length) throw new Error("The PPTX slides could not be found.");
  if (slides.length > MAX_SLIDES) {
    throw new Error("PPTX files with more than 100 slides require pasted text.");
  }
  const text: string[] = [];
  const budget = { usedBytes: 0 };
  for (const slide of slides) {
    const slideText = extractTaggedText(await safeXml(slide, budget), "a:t", "a:p");
    if (slideText) text.push(slideText);
    if (text.join("\n").length >= MAX_EXTRACTED_CHARACTERS) break;
  }
  return cleanExtractedText(text.join("\n"));
}

function summary(
  id: string,
  type: IntakeUploadType,
  file: UploadLike,
  status: IntakeExtractionStatus,
  text: string,
  message?: string,
  textOrigin: IntakeTextOrigin = status === "extracted" ? "server-extracted" : "none",
): IntakeSourceSummary {
  return {
    id,
    type,
    displayName: file.name.trim() || `Upload ${id}`,
    sourceUrl: `urn:founder-evidence:${type}:${encodeURIComponent(file.name.trim() || id)}`,
    extractionStatus: status,
    textOrigin,
    extractedCharacterCount: text.length,
    ...(message ? { message } : {}),
  };
}

export async function extractUploadedDocument(
  file: UploadLike,
  index: number,
  suppliedText = "",
): Promise<ExtractedUpload> {
  const id = `upload-${index + 1}`;
  const type = uploadType(file);
  if (!type) {
    return {
      summary: {
        id,
        type: "manual",
        displayName: file.name.trim() || `Upload ${index + 1}`,
        sourceUrl: `urn:founder-evidence:unsupported:${encodeURIComponent(file.name.trim() || id)}`,
        extractionStatus: "unsupported",
        textOrigin: "none",
        extractedCharacterCount: 0,
        message: "Use PDF, DOCX, or PPTX, or paste the document text instead.",
      },
      text: "",
    };
  }
  const maximumUploadBytes = type === "pdf" ? MAX_PDF_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  if (file.size > maximumUploadBytes) {
    return {
      summary: summary(
        id,
        type,
        file,
        "needs-paste",
        "",
        `This ${type.toUpperCase()} file is over the ${maximumUploadBytes / 1024 / 1024} MB limit. Paste its text instead.`,
      ),
      text: "",
    };
  }

  const pastedText = cleanExtractedText(suppliedText);
  if (type === "pdf") {
    try {
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength > MAX_PDF_UPLOAD_BYTES) {
        throw new Error("The PDF is over the 5 MB limit.");
      }
      const text = await extractPdf(bytes);
      if (!text) throw new Error("No embedded PDF text was found.");
      return {
        summary: summary(
          id,
          type,
          file,
          "extracted",
          text,
          "Embedded PDF text was extracted. Image-only pages may still require pasted text.",
        ),
        text,
      };
    } catch (error) {
      const failure = error instanceof Error ? error.message : "The PDF could not be read.";
      const fallbackMessage = /over \d+ pages/i.test(failure)
        ? failure
        : /timed out/i.test(failure)
          ? "PDF text extraction timed out. Paste its text instead."
          : /no embedded pdf text/i.test(failure)
            ? "No embedded PDF text was found. Image-only PDFs still need pasted text."
            : "This PDF could not be read or may be password-protected. Paste its text instead.";
      return pastedText
        ? {
            summary: summary(
              id,
              type,
              file,
              "provided-text",
              pastedText,
              "The PDF could not be read, so the supplied text was used and was not verified against the uploaded PDF bytes.",
              "user-supplied",
            ),
            text: pastedText,
          }
        : {
            summary: summary(
              id,
              type,
              file,
              "needs-paste",
              "",
              fallbackMessage,
            ),
            text: "",
          };
    }
  }

  try {
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new Error("The document is over the 10 MB limit.");
    }
    const text = type === "docx" ? await extractDocx(bytes) : await extractPptx(bytes);
    if (!text) throw new Error("No ordinary document text was found.");
    return {
      summary: summary(id, type, file, "extracted", text),
      text,
    };
  } catch {
    if (pastedText) {
      return {
        summary: summary(
          id,
          type,
          file,
          "extracted",
          pastedText,
          "The file could not be read, so the supplied pasted text was used.",
        ),
        text: pastedText,
      };
    }
    return {
      summary: summary(
        id,
        type,
        file,
        "needs-paste",
        "",
        `This ${type.toUpperCase()} file could not be read. Paste its text instead.`,
      ),
      text: "",
    };
  }
}
