import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { createEvidenceBundlePost } from "../src/lib/intake/evidence-bundle-route-handler";
import { textPdfBytes } from "./fixtures/text-pdf";

function lunaResponse(claims: unknown) {
  return new Response(JSON.stringify({
    status: "completed",
    incomplete_details: null,
    output: [{
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{
        type: "output_text",
        text: JSON.stringify({ claims }),
      }],
    }],
  }), {
    headers: { "content-type": "application/json" },
  });
}

async function officeFile(name: string, path: string, xml: string, type: string) {
  const zip = new JSZip();
  zip.file(path, xml);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const body = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new File([body], name, { type });
}

function request(form: FormData) {
  return new Request("https://example.test/api/intake/bundle", {
    method: "POST",
    body: form,
  });
}

test("one bounded bundle combines website, manual, PDF, DOCX, and PPTX provenance", async () => {
  let providerCalls = 0;
  const post = createEvidenceBundlePost({
    fetcher: async () => new Response(
      "<html><head><title>Acme Water Labs</title></head><body>Acme Water Labs builds utility analytics.</body></html>",
      { headers: { "content-type": "text/html" } },
    ),
    now: () => new Date("2026-08-15T12:00:00.000Z"),
    luna: {
      apiKey: "test-only-key",
      fetcher: async () => {
        providerCalls += 1;
        return lunaResponse([
          {
            field: "companyName",
            value: "Acme Water Labs",
            evidenceExcerpt: "Acme Water Labs builds utility analytics.",
          },
          {
            field: "employees",
            value: "12 employees",
            evidenceExcerpt: "We have 12 employees in Utah.",
          },
          {
            field: "applicantType",
            value: "U.S. for-profit small business",
            evidenceExcerpt: "Applicant type: U.S. for-profit small business",
          },
          {
            field: "capitalNeed",
            value: "$500,000",
            evidenceExcerpt: "Funding need: $500,000",
          },
          {
            field: "technology",
            value: "membrane sensor platform",
            evidenceExcerpt: "Our membrane sensor platform serves utilities.",
          },
        ]);
      },
    },
  });
  const docx = await officeFile(
    "company.docx",
    "word/document.xml",
    "<w:document xmlns:w=\"w\"><w:body><w:p><w:r><w:t>Applicant type: U.S. for-profit small business</w:t></w:r></w:p></w:body></w:document>",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  const pptx = await officeFile(
    "funding.pptx",
    "ppt/slides/slide1.xml",
    "<p:sld xmlns:p=\"p\" xmlns:a=\"a\"><a:p><a:r><a:t>Funding need: $500,000</a:t></a:r></a:p></p:sld>",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  );
  const form = new FormData();
  form.set("website", "https://acme.example.com");
  form.set("manualText", "We have 12 employees in Utah.");
  form.append("files", docx);
  form.append("fileText", "");
  form.append("files", pptx);
  form.append("fileText", "");
  form.append("files", new File(["%PDF-test"], "company.pdf", { type: "application/pdf" }));
  form.append("fileText", "Our membrane sensor platform serves utilities.");

  const response = await post(request(form));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(providerCalls, 1);
  assert.equal(body.sources.length, 5);
  assert.deepEqual(
    body.sources.map((source: { id: string; extractionStatus: string }) => [source.id, source.extractionStatus]),
    [
      ["website", "extracted"],
      ["manual", "provided-text"],
      ["upload-1", "extracted"],
      ["upload-2", "extracted"],
      ["upload-3", "provided-text"],
    ],
  );
  assert.equal(body.profile.companyName, "Acme Water Labs");
  assert.equal(body.profile.employees, "12 employees");
  assert.equal(body.profile.applicantType, "U.S. for-profit small business");
  assert.equal(body.profile.capitalNeed, "$500,000");
  assert.equal(body.profile.technology, "membrane sensor platform");
  assert.match(body.profile.description, /utility analytics/);
  assert.equal(body.profile.description.includes("Funding need: $500,000"), false);
  assert.deepEqual(
    Object.fromEntries(body.evidence.map((claim: { field: string; sourceId: string }) => [claim.field, claim.sourceId])),
    {
      companyName: "website",
      employees: "manual",
      applicantType: "upload-1",
      capitalNeed: "upload-2",
      technology: "upload-3",
    },
  );
  assert.equal(body.profileFieldOrigins.capitalNeed.origin, "extracted");
  const technologyEvidence = body.evidence.find((claim: { field: string }) => claim.field === "technology");
  assert.equal(technologyEvidence.sourceType, "manual");
  assert.equal(technologyEvidence.associatedUploadType, "pdf");
  assert.equal(technologyEvidence.sourceTextOrigin, "user-supplied");
  assert.match(body.warnings.join(" "), /not verified against the uploaded PDF/);
});

test("bundle intake enforces the five-upload boundary before provider access", async () => {
  let providerCalls = 0;
  const post = createEvidenceBundlePost({
    luna: {
      apiKey: "test-only-key",
      fetcher: async () => {
        providerCalls += 1;
        return lunaResponse([]);
      },
    },
  });
  const form = new FormData();
  for (let index = 0; index < 6; index += 1) {
    form.append("files", new File(["%PDF"], `file-${index}.pdf`, { type: "application/pdf" }));
  }

  const response = await post(request(form));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Upload at most five files." });
  assert.equal(providerCalls, 0);
});

test("duplicate excerpts preserve every matching source instead of guessing provenance", async () => {
  const post = createEvidenceBundlePost({
    luna: {
      apiKey: "test-only-key",
      fetcher: async () => lunaResponse([{
        field: "technology",
        value: "shared sensor platform",
        evidenceExcerpt: "We build a shared sensor platform.",
      }]),
    },
  });
  const form = new FormData();
  form.set("manualText", "We build a shared sensor platform.");
  form.append("files", new File(["%PDF-test"], "duplicate.pdf", { type: "application/pdf" }));
  form.append("fileText", "We build a shared sensor platform.");

  const response = await post(request(form));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.evidence[0].sourceId, "multiple-sources");
  assert.deepEqual(body.evidence[0].sourceIds, ["manual", "upload-1"]);
  assert.match(body.warnings.join(" "), /multiple sources/);
});

test("bundle intake rejects an oversized multipart body before parsing it", async () => {
  const post = createEvidenceBundlePost();
  const response = await post(new Request(
    "https://example.test/api/intake/bundle",
    {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=test",
        "content-length": String(27 * 1024 * 1024),
      },
      body: "--test--",
    },
  ));
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "The intake bundle is too large." });
});

test("an unreadable supported document returns an honest paste-text fallback", async () => {
  const post = createEvidenceBundlePost();
  const form = new FormData();
  form.append("files", new File(["not a zip"], "broken.docx"));

  const response = await post(request(form));
  const body = await response.json();
  assert.equal(response.status, 422);
  assert.equal(body.sources[0].extractionStatus, "needs-paste");
  assert.match(body.sources[0].message, /Paste its text/);
  assert.match(body.fallback, /plain-language company description/);
});

test("file-only PDF intake extracts embedded text and canonicalizes extracted location", async () => {
  let providerCalls = 0;
  const post = createEvidenceBundlePost({
    luna: {
      apiKey: "test-only-key",
      fetcher: async () => {
        providerCalls += 1;
        return lunaResponse([
          {
            field: "companyName",
            value: "Northstar",
            evidenceExcerpt: "Northstar builds advanced manufacturing systems in slc.",
          },
          {
            field: "technology",
            value: "advanced manufacturing systems",
            evidenceExcerpt: "advanced manufacturing systems",
          },
          {
            field: "location",
            value: "slc",
            evidenceExcerpt: "in slc",
          },
        ]);
      },
    },
  });
  const form = new FormData();
  form.set("externalProcessingConsent", "true");
  form.append("files", new File(
    [textPdfBytes("Northstar builds advanced manufacturing systems in slc.")],
    "northstar.pdf",
    { type: "application/pdf" },
  ));

  const response = await post(request(form));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(providerCalls, 1);
  assert.equal(body.sources[0].extractionStatus, "extracted");
  assert.equal(body.sources[0].textOrigin, "server-extracted");
  assert.equal(body.profile.companyName, "Northstar");
  assert.equal(body.profile.industry, "Advanced manufacturing");
  assert.equal(body.profile.technology, "advanced manufacturing systems");
  assert.equal(body.profile.location, "Salt Lake City, UT");
  assert.equal(body.profileFieldOrigins.location.origin, "normalized");
  assert.equal(body.profileFieldOrigins.location.originalValue, "slc");
});
