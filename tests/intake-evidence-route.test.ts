import assert from "node:assert/strict";
import test from "node:test";
import { EXTERNAL_PROCESSING_DISCLOSURE } from "../src/lib/intake/external-processing";
import { createEvidencePost } from "../src/lib/intake/evidence-route-handler";

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

function evidenceRequest(body: unknown) {
  return new Request("https://example.test/api/intake/evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("manual evidence requires explicit external-processing consent", async () => {
  let providerCalls = 0;
  const post = createEvidencePost({
    apiKey: "test-only-key",
    fetcher: async () => {
      providerCalls += 1;
      return lunaResponse([]);
    },
  });

  const response = await post(evidenceRequest({
    sourceType: "manual",
    evidenceText: "Acme builds municipal water sensors for public utilities.",
    externalProcessingConsent: false,
  }));

  assert.equal(response.status, 400);
  assert.equal(providerCalls, 0);
  assert.deepEqual(await response.json(), {
    error: "Explicit consent is required before evidence is sent to OpenAI.",
    externalProcessingDisclosure: EXTERNAL_PROCESSING_DISCLOSURE,
  });
});

test("manual evidence returns only supported profile suggestions and evidence", async () => {
  let providerCalls = 0;
  const evidenceText =
    "Acme Water Labs builds municipal water sensors for public utilities and was founded in 2021.";
  const post = createEvidencePost({
    apiKey: "test-only-key",
    fetcher: async () => {
      providerCalls += 1;
      return lunaResponse([
        {
          field: "companyName",
          value: "Acme Water Labs",
          evidenceExcerpt: "Acme Water Labs builds municipal water sensors",
        },
        {
          field: "technology",
          value: "municipal water sensors",
          evidenceExcerpt: "builds municipal water sensors for public utilities",
        },
        {
          field: "yearFounded",
          value: "2021",
          evidenceExcerpt: "founded in 2021",
        },
      ]);
    },
  });

  const response = await post(evidenceRequest({
    sourceType: "manual",
    evidenceText,
    externalProcessingConsent: true,
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(providerCalls, 1);
  assert.equal(body.profile.companyName, "Acme Water Labs");
  assert.equal(body.profile.description, evidenceText);
  assert.equal(body.profile.technology, "municipal water sensors");
  assert.equal("yearFounded" in body.profile, false);
  assert.equal(body.profile.applicantType, "Unknown — founder input needed");
  assert.equal(body.externalProcessing.completed, true);
  assert.equal(body.externalProcessingDisclosure, EXTERNAL_PROCESSING_DISCLOSURE);
  assert.deepEqual(
    body.evidence.map((claim: { field: string; sourceUrl: string }) => ({
      field: claim.field,
      sourceUrl: claim.sourceUrl,
    })),
    [
      {
        field: "companyName",
        sourceUrl: "urn:founder-evidence:manual",
      },
      {
        field: "technology",
        sourceUrl: "urn:founder-evidence:manual",
      },
    ],
  );
});

test("PDF evidence falls back deterministically when OpenAI is unavailable", async () => {
  const evidenceText =
    "Acme Water Labs builds municipal water sensors for public utilities.";
  const post = createEvidencePost({ apiKey: "" });

  const response = await post(evidenceRequest({
    sourceType: "pdf",
    evidenceText,
    sourceUrl: "https://files.example.test/acme-one-pager.pdf",
    externalProcessingConsent: true,
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.profile.description, evidenceText);
  assert.equal(body.profile.companyName, undefined);
  assert.equal(body.externalProcessing.attempted, false);
  assert.equal(body.externalProcessing.completed, false);
  assert.equal(body.externalProcessing.reason, "missing_api_key");
  assert.match(body.warning, /editable evidence-only profile/);
  assert.equal(body.externalProcessingDisclosure, EXTERNAL_PROCESSING_DISCLOSURE);
});

test("evidence intake rejects unsupported source types before provider access", async () => {
  let providerCalls = 0;
  const post = createEvidencePost({
    apiKey: "test-only-key",
    fetcher: async () => {
      providerCalls += 1;
      return lunaResponse([]);
    },
  });

  const response = await post(evidenceRequest({
    sourceType: "website",
    evidenceText: "Acme builds municipal water sensors for public utilities.",
    externalProcessingConsent: true,
  }));

  assert.equal(response.status, 400);
  assert.equal(providerCalls, 0);
  assert.deepEqual(await response.json(), {
    error: "Source type must be manual or pdf.",
  });
});

test("evidence intake enforces evidence-text and request-body byte limits", async () => {
  let providerCalls = 0;
  const post = createEvidencePost({
    apiKey: "test-only-key",
    fetcher: async () => {
      providerCalls += 1;
      return lunaResponse([]);
    },
  });

  const oversizedEvidence = await post(evidenceRequest({
    sourceType: "manual",
    evidenceText: "x".repeat(24_001),
    externalProcessingConsent: true,
  }));
  assert.equal(oversizedEvidence.status, 413);
  assert.deepEqual(await oversizedEvidence.json(), {
    error: "Evidence text is too large.",
  });

  const oversizedBody = await post(evidenceRequest({
    sourceType: "manual",
    evidenceText: "Acme builds municipal water sensors for public utilities.",
    ignored: "x".repeat(70_000),
    externalProcessingConsent: true,
  }));
  assert.equal(oversizedBody.status, 413);
  assert.deepEqual(await oversizedBody.json(), {
    error: "Request body is too large.",
  });
  assert.equal(providerCalls, 0);
});
