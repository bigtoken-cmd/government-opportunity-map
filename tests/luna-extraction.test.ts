import assert from "node:assert/strict";
import test from "node:test";
import {
  extractFounderEvidence,
  type FounderEvidenceExtractionInput,
} from "../src/lib/intake/luna-extraction";

const EVIDENCE = "Acme Water Labs builds municipal water sensors for public utilities.";

function input(
  overrides: Partial<FounderEvidenceExtractionInput> = {},
): FounderEvidenceExtractionInput {
  return {
    sourceType: "manual",
    evidenceText: EVIDENCE,
    sourceUrl: "",
    ...overrides,
  };
}

function completedTextResponse(text: string) {
  return new Response(JSON.stringify({
    status: "completed",
    incomplete_details: null,
    output: [{
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{
        type: "output_text",
        text,
      }],
    }],
  }), {
    headers: { "content-type": "application/json" },
  });
}

function modelResponse(claims: unknown) {
  return completedTextResponse(JSON.stringify({ claims }));
}

function requestEvidence(body: string) {
  const parsed = JSON.parse(body) as {
    input: Array<{ content: Array<{ text: string }> }>;
  };
  return parsed.input[0]?.content[0]?.text ?? "";
}

async function sanitizeThroughProvider(evidenceText: string) {
  let calls = 0;
  let submittedBody = "";
  const result = await extractFounderEvidence(
    input({ evidenceText }),
    {
      apiKey: "test-only-key",
      fetcher: async (_url, init) => {
        calls += 1;
        submittedBody = String(init?.body);
        return modelResponse([]);
      },
    },
  );
  return {
    calls,
    result,
    submittedEvidence: submittedBody ? requestEvidence(submittedBody) : "",
  };
}

test("secret-like values and government identifiers are redacted before Luna", async () => {
  const syntheticToken = ["sk", "test", "1234567890abcdef"].join("-");
  const syntheticIdentifier = ["123", "45", "6789"].join("-");
  let submittedBody = "";
  const result = await extractFounderEvidence(
    input({
      evidenceText: `${EVIDENCE}\napi_key=${syntheticToken}\nSSN ${syntheticIdentifier}`,
    }),
    {
      apiKey: "test-only-key",
      fetcher: async (_url, init) => {
        submittedBody = String(init?.body);
        return modelResponse([]);
      },
    },
  );

  assert.equal(submittedBody.includes(syntheticToken), false);
  assert.equal(submittedBody.includes(syntheticIdentifier), false);
  assert.match(submittedBody, /\[REDACTED_/);
  assert.equal(result.externalProcessing.redactionCount, 2);
  assert.equal(result.externalProcessing.completed, true);
});

test("common direct identifiers are removed from external evidence", async () => {
  const identifiers = [
    "founder@example.com",
    "(801) 555-0199",
    "123 Main Street Suite 4",
    "routing number: 123456789",
    "A1B2C3D4E5F6",
  ];
  const sanitized = await sanitizeThroughProvider(
    `${EVIDENCE}\nContact: ${identifiers.join(" | ")}`,
  );

  assert.equal(sanitized.calls, 1);
  for (const identifier of identifiers) {
    assert.equal(sanitized.submittedEvidence.includes(identifier), false, identifier);
  }
  assert.match(sanitized.submittedEvidence, /\[REDACTED_PERSONAL_DATA\]/);
  assert.ok(sanitized.result.externalProcessing.redactionCount >= identifiers.length);
});

test("private-key blocks are redacted before Luna", async () => {
  const privateKeyLabels = [
    "PRIVATE KEY",
    "RSA PRIVATE KEY",
    "EC PRIVATE KEY",
    "OPENSSH PRIVATE KEY",
  ];

  for (const label of privateKeyLabels) {
    const material = `synthetic-${label.toLowerCase().replaceAll(" ", "-")}-material`;
    const block = [
      `-----BEGIN ${label}-----`,
      material,
      `-----END ${label}-----`,
    ].join("\n");
    const sanitized = await sanitizeThroughProvider(`${EVIDENCE}\n${block}\nCustomers are public utilities.`);

    assert.equal(sanitized.calls, 1, label);
    assert.equal(sanitized.submittedEvidence.includes(material), false, label);
    assert.match(sanitized.submittedEvidence, /Acme Water Labs/, label);
    assert.match(sanitized.submittedEvidence, /Customers are public utilities/, label);
    assert.equal(sanitized.result.externalProcessing.redactionCount, 1, label);
  }
});

test("quoted credential assignments redact concatenated suffixes through the line boundary", async () => {
  const quotedPart = "synthetic-quoted-part";
  const concatenatedPart = "synthetic-concatenated-suffix";
  const sanitized = await sanitizeThroughProvider([
    EVIDENCE,
    `AZURE_OPENAI_API_KEY="${quotedPart}"${concatenatedPart}`,
    "The company serves rural utilities.",
  ].join("\n"));

  assert.equal(sanitized.calls, 1);
  assert.equal(sanitized.submittedEvidence.includes(quotedPart), false);
  assert.equal(sanitized.submittedEvidence.includes(concatenatedPart), false);
  assert.match(sanitized.submittedEvidence, /Acme Water Labs/);
  assert.match(sanitized.submittedEvidence, /serves rural utilities/);
  assert.equal(sanitized.result.externalProcessing.redactionCount, 1);
});

test("compound credential assignments redact full values while preserving business evidence", async () => {
  const cases = [
    ["AZURE_OPENAI_API_KEY", "=", "api-key"],
    ["AWS_SESSION_TOKEN", ":", "session-token"],
    ["STRIPE_SECRET_KEY", "->", "secret-key"],
    ["service.client-secret", ":=", "client-secret"],
    ["--password", " ", "password"],
    ["database/passphrase", "=", "passphrase"],
    ["DEPLOY_TOKEN", "=>", "token"],
    ["AUTH_SESSION", "=", "session"],
    ["OAUTH_ACCESS", "=", "access"],
    ["OAUTH_REFRESH_TOKEN", "=", "refresh-token"],
    ["tls.private-key", "=", "private-key"],
    ["vault.credential", "=", "credential"],
  ] as const;

  for (const [label, separator, caseName] of cases) {
    const credentialValue = `synthetic-${caseName}/value+with:punctuation,tail`;
    const line = separator === " "
      ? `${label} ${credentialValue}`
      : `${label} ${separator} "${credentialValue}"`;
    const sanitized = await sanitizeThroughProvider([
      EVIDENCE,
      line,
      "The company serves rural utilities.",
    ].join("\n"));

    assert.equal(sanitized.calls, 1, caseName);
    assert.equal(sanitized.submittedEvidence.includes(credentialValue), false, caseName);
    assert.match(sanitized.submittedEvidence, /Acme Water Labs/, caseName);
    assert.match(sanitized.submittedEvidence, /serves rural utilities/, caseName);
    assert.equal(sanitized.result.externalProcessing.completed, true, caseName);
    assert.equal(sanitized.result.externalProcessing.redactionCount, 1, caseName);
  }
});

test("credential-bearing URI userinfo and sensitive connection labels are redacted generically", async () => {
  const uriPassword = "synthetic-uri-password";
  const databasePassword = "synthetic-database-password";
  const encryptionKey = "synthetic-encryption-key-material";
  const sanitized = await sanitizeThroughProvider([
    EVIDENCE,
    `Telemetry endpoint custom+tls://synthetic-user:${uriPassword}@telemetry.example.test/collect`,
    `DATABASE_URL=customdb://app:${databasePassword}@database.example.test/founders`,
    `ENCRYPTION_KEY=${encryptionKey}`,
    "The company serves rural utilities.",
  ].join("\n"));

  assert.equal(sanitized.calls, 1);
  assert.equal(sanitized.submittedEvidence.includes(uriPassword), false);
  assert.equal(sanitized.submittedEvidence.includes(databasePassword), false);
  assert.equal(sanitized.submittedEvidence.includes(encryptionKey), false);
  assert.match(sanitized.submittedEvidence, /Acme Water Labs/);
  assert.match(sanitized.submittedEvidence, /serves rural utilities/);
  assert.equal(sanitized.result.externalProcessing.redactionCount, 3);
});

test("ambiguous credential-bearing URIs and DSNs fail closed with no provider egress", async () => {
  const unsafeCases = [
    `${EVIDENCE}\nConnection custom+tls://synthetic-user:synthetic-password@`,
    `${EVIDENCE}\nDATABASE_URL="""customdb://app:synthetic-password@database.example.test/db`,
    `${EVIDENCE}\nOBSERVABILITY_DSN=custom+tls://synthetic-user:synthetic-password@`,
  ];

  for (const evidenceText of unsafeCases) {
    const sanitized = await sanitizeThroughProvider(evidenceText);

    assert.equal(sanitized.calls, 0);
    assert.equal(sanitized.result.externalProcessing.reason, "sensitive_evidence");
    assert.equal(sanitized.result.externalProcessing.attempted, false);
  }
});

test("credential headers redact complete values and preserve safe neighboring lines", async () => {
  const basicValue = Buffer.from("synthetic-user:synthetic-password").toString("base64");
  const bearerValue = "synthetic.bearer/value+123456";
  const cases = [
    ["Authorization", `Basic ${basicValue}`, basicValue],
    ["Authorization", `Bearer ${bearerValue}`, bearerValue],
    ["Proxy-Authorization", `Basic ${basicValue}`, basicValue],
    ["Cookie", "session=synthetic-cookie-value; theme=green", "synthetic-cookie-value"],
    ["Set-Cookie", "refresh=synthetic-set-cookie-value; HttpOnly", "synthetic-set-cookie-value"],
  ] as const;

  for (const [header, headerValue, secret] of cases) {
    const sanitized = await sanitizeThroughProvider([
      EVIDENCE,
      `${header}: ${headerValue}`,
      "Research focuses on leak detection.",
    ].join("\n"));

    assert.equal(sanitized.calls, 1, header);
    assert.equal(sanitized.submittedEvidence.includes(secret), false, header);
    assert.match(sanitized.submittedEvidence, /Acme Water Labs/, header);
    assert.match(sanitized.submittedEvidence, /Research focuses on leak detection/, header);
    assert.equal(sanitized.result.externalProcessing.redactionCount, 1, header);
  }
});

test("recognized bearer, basic, JWT, and provider tokens are redacted wherever found", async () => {
  const jwt = [
    Buffer.from('{"alg":"HS256"}').toString("base64url"),
    Buffer.from('{"sub":"synthetic"}').toString("base64url"),
    "synthetic-signature-value",
  ].join(".");
  const cases = [
    ["bearer", `Bearer synthetic.bearer/value+123456`, "synthetic.bearer/value+123456"],
    [
      "basic",
      `Basic ${Buffer.from("synthetic-user:synthetic-password").toString("base64")}`,
      Buffer.from("synthetic-user:synthetic-password").toString("base64"),
    ],
    ["jwt", jwt, jwt],
    ["openai", ["sk", "proj", "syntheticvalue1234567890"].join("-"), "syntheticvalue1234567890"],
    ["github", `ghp_${"s".repeat(36)}`, "s".repeat(36)],
    ["aws", `AKIA${"A".repeat(16)}`, "A".repeat(16)],
    ["stripe", `sk_live_${"s".repeat(24)}`, "s".repeat(24)],
    ["slack", `xoxb-${"1".repeat(12)}-${"s".repeat(24)}`, "s".repeat(24)],
  ] as const;

  for (const [caseName, tokenText, secretPart] of cases) {
    const sanitized = await sanitizeThroughProvider(
      `${EVIDENCE}\nDiagnostic credential ${tokenText} must be removed.\nCustomers remain public utilities.`,
    );

    assert.equal(sanitized.calls, 1, caseName);
    assert.equal(sanitized.submittedEvidence.includes(secretPart), false, caseName);
    assert.match(sanitized.submittedEvidence, /Acme Water Labs/, caseName);
    assert.match(sanitized.submittedEvidence, /Customers remain public utilities/, caseName);
    assert.equal(sanitized.result.externalProcessing.redactionCount, 1, caseName);
  }
});

test("benign technical credential discussion is preserved without redaction", async () => {
  const benignEvidence = [
    EVIDENCE,
    "Our platform helps teams rotate API keys and discuss client-secret hygiene.",
    "It supports passwordless access, session management, JWT validation, and tokenization.",
    "Authorization design and cookie analytics are research topics, not supplied credentials.",
  ];
  const sanitized = await sanitizeThroughProvider(benignEvidence.join("\n"));

  assert.equal(sanitized.calls, 1);
  assert.equal(sanitized.submittedEvidence, benignEvidence.join("\n"));
  assert.equal(sanitized.result.externalProcessing.redactionCount, 0);
  assert.equal(sanitized.result.externalProcessing.completed, true);
});

test("unsafe credential delimiters fail closed without sending any evidence", async () => {
  const unsafeCases = [
    `${EVIDENCE}\n-----BEGIN PRIVATE KEY-----\nunterminated-key-material`,
    `${EVIDENCE}\nAZURE_OPENAI_API_KEY="unterminated-value`,
    `${EVIDENCE}\nAWS_SESSION_TOKEN=synthetic-value\\`,
    `${EVIDENCE}\ntls.private-key: |\n  multiline-value-without-safe-boundary`,
  ];

  for (const evidenceText of unsafeCases) {
    const sanitized = await sanitizeThroughProvider(evidenceText);

    assert.equal(sanitized.calls, 0);
    assert.equal(sanitized.result.externalProcessing.reason, "sensitive_evidence");
    assert.ok(Object.values(sanitized.result.proposedProfile).every((value) => value === ""));
  }
});

test("evidence that is unusable after redaction skips Luna", async () => {
  const syntheticToken = ["sk", "test", "onlysecretvalue"].join("-");
  let calls = 0;
  const result = await extractFounderEvidence(
    input({ evidenceText: `api_key=${syntheticToken}` }),
    {
      apiKey: "test-only-key",
      fetcher: async () => {
        calls += 1;
        return modelResponse([]);
      },
    },
  );

  assert.equal(calls, 0);
  assert.equal(result.externalProcessing.reason, "sensitive_evidence");
});

test("one unsupported evidence claim is dropped without discarding valid claims", async () => {
  const result = await extractFounderEvidence(input(), {
    apiKey: "test-only-key",
    fetcher: async () => modelResponse([
      {
        field: "companyName",
        value: "Acme Water Labs",
        evidenceExcerpt: "Acme Water Labs builds municipal water sensors",
      },
      {
        field: "industry",
        value: "Defense technology",
        evidenceExcerpt: "municipal water sensors for public utilities",
      },
    ]),
  });

  assert.equal(result.externalProcessing.completed, true);
  assert.equal(result.proposedProfile.companyName, "Acme Water Labs");
  assert.equal(result.proposedProfile.industry, "");
});

test("strict claim validation keeps valid claims when neighboring claims are unusable", async () => {
  const validClaim = {
    field: "companyName",
    value: "Acme Water Labs",
    evidenceExcerpt: "Acme Water Labs builds municipal water sensors",
  };
  const mixedClaimSets = [
    [validClaim, { field: "technology", value: "municipal water sensors" }],
    [validClaim, { ...validClaim }],
    [validClaim, {
      field: "deadline",
      value: "public utilities",
      evidenceExcerpt: "municipal water sensors for public utilities",
    }],
  ];

  for (const claims of mixedClaimSets) {
    const result = await extractFounderEvidence(input(), {
      apiKey: "test-only-key",
      fetcher: async () => modelResponse(claims),
    });

    assert.equal(result.externalProcessing.completed, true);
    assert.equal(result.proposedProfile.companyName, "Acme Water Labs");
  }

  const extraOnly = await extractFounderEvidence(input(), {
    apiKey: "test-only-key",
    fetcher: async () => modelResponse([{ ...validClaim, extra: true }]),
  });
  assert.equal(extraOnly.externalProcessing.reason, "schema_failure");
  assert.ok(Object.values(extraOnly.proposedProfile).every((value) => value === ""));
  assert.deepEqual(extraOnly.evidence, []);
});

test("strict structured output rejects extra top-level properties", async () => {
  const result = await extractFounderEvidence(input(), {
    apiKey: "test-only-key",
    fetcher: async () => completedTextResponse(JSON.stringify({
      claims: [],
      extra: true,
    })),
  });

  assert.equal(result.externalProcessing.reason, "schema_failure");
  assert.ok(Object.values(result.proposedProfile).every((value) => value === ""));
});

test("malformed structured output falls back with blank proposals", async () => {
  const result = await extractFounderEvidence(input(), {
    apiKey: "test-only-key",
    fetcher: async () => new Response(JSON.stringify({
      output: [{
        content: [{ type: "output_text", text: "{\"claims\":\"wrong\"}" }],
      }],
    })),
  });

  assert.equal(result.externalProcessing.reason, "schema_failure");
  assert.ok(Object.values(result.proposedProfile).every((value) => value === ""));
});

test("incomplete, failed, refused, and ambiguous Responses outputs apply no claims", async () => {
  const claimText = JSON.stringify({
    claims: [{
      field: "companyName",
      value: "Acme Water Labs",
      evidenceExcerpt: "Acme Water Labs builds municipal water sensors",
    }],
  });
  const completedMessage = {
    type: "message",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text: claimText }],
  };
  const invalidResponses = [
    {
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [completedMessage],
    },
    {
      status: "failed",
      incomplete_details: null,
      output: [completedMessage],
    },
    {
      status: "completed",
      incomplete_details: { reason: "content_filter" },
      output: [completedMessage],
    },
    {
      status: "completed",
      incomplete_details: null,
      error: { message: "synthetic provider error" },
      output: [completedMessage],
    },
    {
      status: "completed",
      incomplete_details: null,
      output: [
        { type: "function_call", name: "unexpected", arguments: "{}" },
        completedMessage,
      ],
    },
    {
      status: "completed",
      incomplete_details: null,
      output: [
        { type: "web_search_call", status: "completed" },
        completedMessage,
      ],
    },
    {
      status: "completed",
      incomplete_details: null,
      output: [
        { type: "unknown_future_action" },
        completedMessage,
      ],
    },
    {
      status: "completed",
      incomplete_details: null,
      output: [
        { type: "reasoning", id: "rs_test", summary: [], action: "unexpected" },
        completedMessage,
      ],
    },
    {
      status: "completed",
      incomplete_details: null,
      output: [{ ...completedMessage, phase: "commentary" }],
    },
    {
      status: "completed",
      incomplete_details: null,
      output: [{ ...completedMessage, status: "incomplete" }],
    },
    {
      status: "completed",
      incomplete_details: null,
      output: [{ ...completedMessage, role: "user" }],
    },
    {
      status: "completed",
      incomplete_details: null,
      output: [{
        ...completedMessage,
        content: [{ type: "refusal", refusal: "synthetic refusal" }],
      }],
    },
    {
      status: "completed",
      incomplete_details: null,
      output: [completedMessage, completedMessage],
    },
    {
      status: "completed",
      incomplete_details: null,
      output: [{
        ...completedMessage,
        content: [
          { type: "output_text", text: claimText },
          { type: "output_text", text: claimText },
        ],
      }],
    },
  ];

  for (const responseBody of invalidResponses) {
    const result = await extractFounderEvidence(input(), {
      apiKey: "test-only-key",
      fetcher: async () => new Response(JSON.stringify(responseBody)),
    });

    assert.equal(result.externalProcessing.reason, "schema_failure");
    assert.ok(Object.values(result.proposedProfile).every((value) => value === ""));
    assert.deepEqual(result.evidence, []);
  }
});

test("completed Responses accept only final assistant phase metadata", async () => {
  for (const phase of [null, "final_answer"] as const) {
    const result = await extractFounderEvidence(input(), {
      apiKey: "test-only-key",
      fetcher: async () => new Response(JSON.stringify({
        status: "completed",
        error: null,
        incomplete_details: null,
        output: [
          {
            type: "reasoning",
            id: "rs_synthetic",
            status: "completed",
            summary: [{ type: "summary_text", text: "Synthetic inert summary." }],
          },
          {
            type: "message",
            role: "assistant",
            phase,
            status: "completed",
            content: [{
              type: "output_text",
              text: JSON.stringify({
                claims: [{
                  field: "companyName",
                  value: "Acme Water Labs",
                  evidenceExcerpt: "Acme Water Labs builds municipal water sensors",
                }],
              }),
            }],
          },
        ],
      })),
    });

    assert.equal(result.externalProcessing.completed, true);
    assert.equal(result.proposedProfile.companyName, "Acme Water Labs");
  }
});

test("duplicate JSON object keys reject the entire extraction", async () => {
  const duplicatePayloads = [
    '{"claims":[],"claims":[{"field":"companyName","value":"Acme Water Labs","evidenceExcerpt":"Acme Water Labs builds municipal water sensors"}]}',
    '{"claims":[{"field":"companyName","field":"technology","value":"municipal water sensors","evidenceExcerpt":"builds municipal water sensors for public utilities"}]}',
  ];

  for (const payload of duplicatePayloads) {
    const result = await extractFounderEvidence(input(), {
      apiKey: "test-only-key",
      fetcher: async () => completedTextResponse(payload),
    });

    assert.equal(result.externalProcessing.reason, "schema_failure");
    assert.ok(Object.values(result.proposedProfile).every((value) => value === ""));
    assert.deepEqual(result.evidence, []);
  }
});

test("missing key and provider errors use deterministic fallback", async () => {
  const missingKey = await extractFounderEvidence(input(), {
    apiKey: "",
    fetcher: async () => modelResponse([]),
  });
  const providerError = await extractFounderEvidence(input(), {
    apiKey: "test-only-key",
    fetcher: async () => new Response(null, { status: 503 }),
  });

  assert.equal(missingKey.externalProcessing.reason, "missing_api_key");
  assert.equal(providerError.externalProcessing.reason, "provider_error");
});

test("whitespace-only API key skips the provider", async () => {
  let calls = 0;
  const result = await extractFounderEvidence(input(), {
    apiKey: " \n\t ",
    fetcher: async () => {
      calls += 1;
      return modelResponse([]);
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.externalProcessing.reason, "missing_api_key");
  assert.equal(result.externalProcessing.attempted, false);
});

test("network and invalid-provider-JSON failures use deterministic fallback", async () => {
  const networkFailure = await extractFounderEvidence(input(), {
    apiKey: "test-only-key",
    fetcher: async () => {
      throw new Error("synthetic network failure with a value that must not escape");
    },
  });
  const invalidJson = await extractFounderEvidence(input(), {
    apiKey: "test-only-key",
    fetcher: async () => new Response("not-json"),
  });

  assert.equal(networkFailure.externalProcessing.reason, "provider_error");
  assert.equal(invalidJson.externalProcessing.reason, "schema_failure");
  assert.ok(Object.values(networkFailure.proposedProfile).every((value) => value === ""));
  assert.ok(Object.values(invalidJson.proposedProfile).every((value) => value === ""));
});

test("provider timeout aborts and uses deterministic fallback", async () => {
  const result = await extractFounderEvidence(input(), {
    apiKey: "test-only-key",
    timeoutMs: 5,
    fetcher: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    }),
  });

  assert.equal(result.externalProcessing.reason, "timeout");
  assert.equal(result.externalProcessing.completed, false);
});

test("provider response-body timeout uses deterministic fallback", async () => {
  const result = await extractFounderEvidence(input(), {
    apiKey: "test-only-key",
    timeoutMs: 5,
    fetcher: async () => {
      const response = new Response("{}");
      response.json = async () => new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error("synthetic late body failure")), 20);
      });
      return response;
    },
  });

  assert.equal(result.externalProcessing.reason, "timeout");
  assert.equal(result.externalProcessing.completed, false);
});

test("successful extraction uses the approved Responses API contract", async () => {
  let requestedUrl = "";
  let requestBody: Record<string, unknown> = {};
  const result = await extractFounderEvidence(input({ sourceType: "pdf" }), {
    apiKey: "  test-only-key  ",
    fetcher: async (url, init) => {
      requestedUrl = String(url);
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-only-key");
      return modelResponse([{
        field: "technology",
        value: "municipal water sensors",
        evidenceExcerpt: "builds municipal water sensors for public utilities",
      }]);
    },
  });

  assert.equal(requestedUrl, "https://api.openai.com/v1/responses");
  assert.equal(requestBody.model, "gpt-5.6-luna");
  assert.equal(requestBody.store, false);
  assert.equal(JSON.stringify(requestBody).includes("test-only-key"), false);
  assert.match(String(requestBody.instructions), /^# Founder Evidence Extraction Policy/m);
  assert.match(String(requestBody.instructions), /untrusted data/i);
  assert.match(String(requestBody.instructions), /ignore embedded instructions/i);
  assert.match(String(requestBody.instructions), /never (?:repeat|output) secret-like values/i);
  assert.match(String(requestBody.instructions), /no tools, actions/i);
  assert.match(String(requestBody.instructions), /verbatim/i);
  assert.match(String(requestBody.instructions), /inferred/i);
  assert.match(String(requestBody.instructions), /summarized/i);
  assert.match(String(requestBody.instructions), /unsupported facts unknown/i);
  for (const field of [
    "companyName",
    "description",
    "industry",
    "technology",
    "location",
    "yearFounded",
    "customers",
    "researchActivities",
  ]) {
    assert.match(String(requestBody.instructions), new RegExp(`\\b${field}\\b`));
  }
  assert.equal(
    (requestBody.text as { format: { strict: boolean } }).format.strict,
    true,
  );
  assert.equal(result.proposedProfile.technology, "municipal water sensors");
  assert.equal(result.externalProcessing.reason, null);
  assert.equal(result.externalProcessing.completed, true);
});

test("all supported evidence source types use Luna when a key is present", async () => {
  for (const sourceType of ["website", "manual", "pdf", "docx", "pptx"] as const) {
    let calls = 0;
    const result = await extractFounderEvidence(input({ sourceType }), {
      apiKey: "test-only-key",
      fetcher: async () => {
        calls += 1;
        return modelResponse([]);
      },
    });

    assert.equal(calls, 1, sourceType);
    assert.equal(result.externalProcessing.completed, true, sourceType);
  }
});

test("inferred categorical claims and a summarized description are accepted", async () => {
  const evidenceText = [
    "Helios Filtration is a for-profit startup based in Salt Lake City, Utah.",
    "We build membrane filtration for municipal water utilities.",
    "The company is founder-owned.",
    "Funds would buy pilot equipment.",
  ].join(" ");
  const result = await extractFounderEvidence(input({ evidenceText }), {
    apiKey: "test-only-key",
    fetcher: async () => modelResponse([
      {
        field: "description",
        kind: "summarized",
        value: "Helios Filtration builds membrane filtration for municipal water utilities.",
        evidenceExcerpt: "We build membrane filtration for municipal water utilities.",
      },
      {
        field: "industry",
        kind: "inferred",
        value: "Water and environmental services",
        evidenceExcerpt: "membrane filtration for municipal water utilities",
      },
      {
        field: "technology",
        kind: "verbatim",
        value: "membrane filtration",
        evidenceExcerpt: "We build membrane filtration for municipal water utilities.",
      },
      {
        field: "location",
        kind: "verbatim",
        value: "Salt Lake City, Utah",
        evidenceExcerpt: "based in Salt Lake City, Utah.",
      },
      {
        field: "applicantType",
        kind: "inferred",
        value: "For-profit business",
        evidenceExcerpt: "for-profit startup",
      },
      {
        field: "ownership",
        kind: "inferred",
        value: "Founder-owned",
        evidenceExcerpt: "The company is founder-owned.",
      },
      {
        field: "useOfFunds",
        kind: "verbatim",
        value: "pilot equipment",
        evidenceExcerpt: "Funds would buy pilot equipment.",
      },
    ]),
  });

  assert.equal(result.externalProcessing.completed, true);
  const filled = [
    "description",
    "industry",
    "technology",
    "location",
    "applicantType",
    "ownership",
    "useOfFunds",
  ].filter((field) => result.proposedProfile[field as keyof typeof result.proposedProfile]);
  assert.ok(filled.length >= 5, `filled ${filled.join(",")}`);
  assert.equal(result.evidence.find((claim) => claim.field === "description")?.kind, "summarized");
  assert.equal(result.evidence.find((claim) => claim.field === "applicantType")?.kind, "inferred");
});

test("inferred claims cannot invent values for non-categorical fields", async () => {
  const result = await extractFounderEvidence(input(), {
    apiKey: "test-only-key",
    fetcher: async () => modelResponse([{
      field: "companyName",
      kind: "inferred",
      value: "Acme Defense Labs",
      evidenceExcerpt: "Acme Water Labs builds municipal water sensors",
    }]),
  });
  assert.equal(result.externalProcessing.reason, "schema_failure");
});

test("inferred capitalRaised may restate a pre-seed amount that appears in the excerpt", async () => {
  const evidenceText = "Helios closed a pre-seed raise of $2M to ship membrane pilots.";
  const result = await extractFounderEvidence(input({ evidenceText }), {
    apiKey: "test-only-key",
    fetcher: async () => modelResponse([
      {
        field: "description",
        kind: "summarized",
        value: "Helios ships membrane pilots for water utilities.",
        evidenceExcerpt: "to ship membrane pilots.",
      },
      {
        field: "capitalRaised",
        kind: "inferred",
        value: "$2 million",
        evidenceExcerpt: "pre-seed raise of $2M",
      },
    ]),
  });

  assert.equal(result.externalProcessing.completed, true);
  assert.equal(result.proposedProfile.capitalRaised, "$2 million");
  assert.equal(result.evidence.find((claim) => claim.field === "capitalRaised")?.kind, "inferred");
});

test("verbatim description dumps are dropped while other claims still apply", async () => {
  const evidenceText = `${"Deck context. ".repeat(40)}Acme Water Labs builds municipal water sensors for public utilities.`;
  const result = await extractFounderEvidence(input({ evidenceText }), {
    apiKey: "test-only-key",
    fetcher: async () => modelResponse([
      {
        field: "description",
        kind: "verbatim",
        value: evidenceText,
        evidenceExcerpt: evidenceText,
      },
      {
        field: "technology",
        value: "municipal water sensors",
        evidenceExcerpt: "builds municipal water sensors for public utilities",
      },
    ]),
  });

  assert.equal(result.externalProcessing.completed, true);
  assert.equal(result.proposedProfile.description, "");
  assert.equal(result.proposedProfile.technology, "municipal water sensors");
});
