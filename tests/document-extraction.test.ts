import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import {
  extractUploadedDocument,
  type UploadLike,
} from "../src/lib/intake/document-extraction";
import { textPdfBytes } from "./fixtures/text-pdf";

function upload(name: string, bytes: Uint8Array, type = "application/octet-stream"): UploadLike {
  return {
    name,
    type,
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  };
}

async function docxBytes() {
  const zip = new JSZip();
  zip.file("word/document.xml", [
    "<?xml version=\"1.0\"?>",
    "<w:document xmlns:w=\"urn:test\"><w:body>",
    "<w:p><w:r><w:t>Acme Water Labs</w:t></w:r></w:p>",
    "<w:p><w:r><w:t>builds municipal water sensors &amp; analytics.</w:t></w:r></w:p>",
    "</w:body></w:document>",
  ].join(""));
  return zip.generateAsync({ type: "uint8array" });
}

async function pptxBytes() {
  const zip = new JSZip();
  zip.file("ppt/slides/slide2.xml", "<p:sld xmlns:p=\"p\" xmlns:a=\"a\"><a:p><a:r><a:t>Public utility pilots</a:t></a:r></a:p></p:sld>");
  zip.file("ppt/slides/slide1.xml", "<p:sld xmlns:p=\"p\" xmlns:a=\"a\"><a:p><a:r><a:t>Sensor research</a:t></a:r></a:p></p:sld>");
  return zip.generateAsync({ type: "uint8array" });
}

test("ordinary DOCX text reaches the shared evidence boundary", async () => {
  const result = await extractUploadedDocument(
    upload("company.docx", await docxBytes()),
    0,
  );
  assert.equal(result.summary.type, "docx");
  assert.equal(result.summary.extractionStatus, "extracted");
  assert.match(result.text, /Acme Water Labs/);
  assert.match(result.text, /municipal water sensors & analytics/);
});

test("ordinary PPTX slide text is extracted in slide order without notes or media", async () => {
  const result = await extractUploadedDocument(
    upload("company.pptx", await pptxBytes()),
    0,
  );
  assert.equal(result.summary.type, "pptx");
  assert.equal(result.summary.extractionStatus, "extracted");
  assert.ok(result.text.indexOf("Sensor research") < result.text.indexOf("Public utility pilots"));
});

test("PDF extracts embedded text and keeps an honest image-only fallback", async () => {
  const extracted = await extractUploadedDocument(
    upload(
      "company.pdf",
      textPdfBytes("Acme serves municipal utilities with water sensors."),
      "application/pdf",
    ),
    0,
  );
  assert.equal(extracted.summary.extractionStatus, "extracted");
  assert.equal(extracted.summary.textOrigin, "server-extracted");
  assert.match(extracted.text, /municipal utilities with water sensors/);

  const invalidBytes = new TextEncoder().encode("%PDF-fixture");
  const supplied = await extractUploadedDocument(
    upload("company.pdf", invalidBytes, "application/pdf"),
    1,
    "Acme serves municipal utilities with water sensors.",
  );
  assert.equal(supplied.summary.extractionStatus, "provided-text");
  assert.equal(supplied.summary.textOrigin, "user-supplied");
  assert.match(supplied.summary.message ?? "", /not verified against the uploaded PDF bytes/);

  const unreadable = await extractUploadedDocument(
    upload("scanned.pdf", invalidBytes, "application/pdf"),
    2,
  );
  assert.equal(unreadable.summary.extractionStatus, "needs-paste");
  assert.match(unreadable.summary.message ?? "", /could not be read|password-protected/);

  const oversized = upload("oversized.pdf", invalidBytes, "application/pdf");
  oversized.size = 5 * 1024 * 1024 + 1;
  const limited = await extractUploadedDocument(oversized, 3);
  assert.equal(limited.summary.extractionStatus, "needs-paste");
  assert.match(limited.summary.message ?? "", /over the 5 MB limit/);
});

test("compressed office text parts are rejected from central-directory sizes before inflation", async () => {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<w:document><w:t>${"x".repeat(2 * 1024 * 1024 + 1)}</w:t></w:document>`,
  );
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const result = await extractUploadedDocument(upload("oversized.docx", bytes), 0);

  assert.equal(result.text, "");
  assert.equal(result.summary.extractionStatus, "needs-paste");
});

test("forged ZIP size metadata cannot bypass streamed expansion limits", async () => {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<w:document><w:t>${"y".repeat(2 * 1024 * 1024 + 1)}</w:t></w:document>`,
  );
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset <= bytes.byteLength - 4; offset += 1) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x04034b50) view.setUint32(offset + 22, 1, true);
    if (signature === 0x02014b50) view.setUint32(offset + 24, 1, true);
  }
  const result = await extractUploadedDocument(upload("forged.docx", bytes), 0);

  assert.equal(result.text, "");
  assert.equal(result.summary.extractionStatus, "needs-paste");
});

test("PPTX files over the slide cap fail honestly instead of silently truncating", async () => {
  const zip = new JSZip();
  for (let index = 1; index <= 101; index += 1) {
    zip.file(`ppt/slides/slide${index}.xml`, `<p:sld><a:t>Slide ${index}</a:t></p:sld>`);
  }
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  const result = await extractUploadedDocument(upload("long.pptx", bytes), 0);

  assert.equal(result.text, "");
  assert.equal(result.summary.extractionStatus, "needs-paste");
});

test("unreadable office files fail honestly with a paste-text fallback", async () => {
  const result = await extractUploadedDocument(
    upload("broken.docx", new TextEncoder().encode("not a zip")),
    0,
  );
  assert.equal(result.text, "");
  assert.equal(result.summary.extractionStatus, "needs-paste");
  assert.match(result.summary.message ?? "", /could not be read/);
});
