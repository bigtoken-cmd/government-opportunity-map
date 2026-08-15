import { INTAKE_EXTRACTION_INSTRUCTIONS } from "../agents/instructions";
import { excerptSupportsMappedAmount } from "./evidence-facts";

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const LUNA_MODEL = "gpt-5.6-luna";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_MAPPED_VALUE_CHARS = 400;
const MAX_VERBATIM_DESCRIPTION_CHARS = 320;

const FOUNDER_PROFILE_FIELDS = [
  "companyName",
  "description",
  "industry",
  "technology",
  "location",
  "yearFounded",
  "employees",
  "revenue",
  "capitalRaised",
  "capitalNeed",
  "useOfFunds",
  "customers",
  "researchActivities",
  "applicantType",
  "legalEntityType",
  "ownership",
  "productStage",
  "researchStage",
  "smallBusinessStatus",
  "usEntityStatus",
  "samStatus",
  "uei",
] as const;

const REDACTED_CREDENTIAL = "[REDACTED_CREDENTIAL]";
const REDACTED_PERSONAL_DATA = "[REDACTED_PERSONAL_DATA]";
const EXTRACTION_POLICY = `${INTAKE_EXTRACTION_INSTRUCTIONS}

Propose only these founder-profile fields: ${FOUNDER_PROFILE_FIELDS.join(", ")}.`;
export type FounderEvidenceClaimKind = "verbatim" | "inferred" | "summarized";

export type FounderEvidenceSourceType = "website" | "manual" | "pdf" | "docx" | "pptx";
export type FounderProfileProposalField = (typeof FOUNDER_PROFILE_FIELDS)[number];
const INFERRED_PROFILE_FIELDS = new Set<FounderProfileProposalField>([
  "industry",
  "applicantType",
  "ownership",
  "legalEntityType",
  "productStage",
  "researchStage",
  "smallBusinessStatus",
  "usEntityStatus",
]);
const INFERRED_AMOUNT_FIELDS = new Set<FounderProfileProposalField>([
  "capitalRaised",
  "capitalNeed",
  "revenue",
]);
export type ExternalProcessingReason =
  | "invalid_evidence"
  | "missing_api_key"
  | "provider_error"
  | "schema_failure"
  | "sensitive_evidence"
  | "timeout";

export interface FounderEvidenceExtractionInput {
  sourceType: FounderEvidenceSourceType;
  evidenceText: string;
  sourceUrl: string;
}

export interface LunaExtractionDependencies {
  apiKey?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export interface FounderEvidenceClaim {
  field: FounderProfileProposalField;
  value: string;
  evidenceExcerpt: string;
  kind: FounderEvidenceClaimKind;
  sourceType: FounderEvidenceSourceType;
  sourceUrl: string;
}

export interface FounderEvidenceExtractionResult {
  proposedProfile: Record<FounderProfileProposalField, string>;
  evidence: FounderEvidenceClaim[];
  externalProcessing: {
    attempted: boolean;
    completed: boolean;
    reason: ExternalProcessingReason | null;
    redactionCount: number;
    provider: "openai";
    model: typeof LUNA_MODEL;
  };
}

interface RedactionResult {
  text: string;
  count: number;
  unsafe: boolean;
}

interface StructuredClaim {
  field: FounderProfileProposalField;
  value: string;
  evidenceExcerpt: string;
  kind: FounderEvidenceClaimKind;
}

const PROFILE_FIELD_SET = new Set<string>(FOUNDER_PROFILE_FIELDS);
const ASSIGNMENT_PATTERN =
  /(^|[\r\n{(\[,;?&])[ \t]*(?:(?:export|setx?|const|let|var|declare(?:[ \t]+-x)?)[ \t]+)?(["'`]?)([$-]*[a-z0-9][a-z0-9_$./\\@-]*(?:[ \t]+[a-z0-9][a-z0-9_$./\\@-]*){0,4})\2[ \t]*(?::=|=>|->|=|:)[ \t]*/gim;
const SPACE_ASSIGNMENT_PATTERN =
  /(^|\r?\n)[ \t]*(?:(?:export|setx?|const|let|var|declare(?:[ \t]+-x)?)[ \t]+)?(["'`]?)([$-]*[a-z0-9][a-z0-9_$./\\@-]*(?:[ \t]+[a-z0-9][a-z0-9_$./\\@-]*){0,3})\2[ \t]+(?=\S)/gim;

function blankProfile(): Record<FounderProfileProposalField, string> {
  return {
    companyName: "",
    description: "",
    industry: "",
    technology: "",
    location: "",
    yearFounded: "",
    employees: "",
    revenue: "",
    capitalRaised: "",
    capitalNeed: "",
    useOfFunds: "",
    customers: "",
    researchActivities: "",
    applicantType: "",
    legalEntityType: "",
    ownership: "",
    productStage: "",
    researchStage: "",
    smallBusinessStatus: "",
    usEntityStatus: "",
    samStatus: "",
    uei: "",
  };
}

function fallback(
  reason: ExternalProcessingReason,
  redactionCount: number,
  attempted = false,
): FounderEvidenceExtractionResult {
  return {
    proposedProfile: blankProfile(),
    evidence: [],
    externalProcessing: {
      attempted,
      completed: false,
      reason,
      redactionCount,
      provider: "openai",
      model: LUNA_MODEL,
    },
  };
}

function isSensitiveAssignmentLabel(value: string) {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  const lastWord = words.at(-1) ?? "";
  if (
    [
      "secret",
      "password",
      "passphrase",
      "token",
      "session",
      "access",
      "credential",
      "credentials",
      "dsn",
      "key",
    ].includes(lastWord)
  ) {
    return true;
  }

  const normalized = words.join(" ");
  const compact = words.join("");
  if (
    (lastWord === "url" || lastWord === "uri")
    && words.slice(0, -1).some((word) =>
      ["connection", "database", "datasource", "db"].includes(word))
  ) {
    return true;
  }
  const compoundSuffixes = [
    "api key",
    "client secret",
    "secret key",
    "secret access key",
    "access key",
    "session token",
    "access token",
    "refresh token",
    "private key",
  ];
  return compoundSuffixes.some((suffix) =>
    normalized === suffix ||
    normalized.endsWith(` ${suffix}`) ||
    compact.endsWith(suffix.replaceAll(" ", ""))
  );
}

const URI_CANDIDATE_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]*/gi;

function credentialUriState(candidate: string): "none" | "credential" | "unsafe" {
  const authorityStart = candidate.indexOf("://") + 3;
  const authorityEnd = candidate.slice(authorityStart).search(/[/?#]/);
  const authority = authorityEnd < 0
    ? candidate.slice(authorityStart)
    : candidate.slice(authorityStart, authorityStart + authorityEnd);
  if (!authority.includes("@")) return "none";
  try {
    const url = new URL(candidate);
    return url.hostname && (url.username || url.password)
      ? "credential"
      : "unsafe";
  } catch {
    return "unsafe";
  }
}

function containsAmbiguousCredentialUri(value: string) {
  URI_CANDIDATE_PATTERN.lastIndex = 0;
  for (const match of value.matchAll(URI_CANDIDATE_PATTERN)) {
    if (credentialUriState(match[0]) === "unsafe") return true;
  }
  return false;
}

function redactCredentialUris(source: string): RedactionResult {
  let text = "";
  let cursor = 0;
  let count = 0;
  URI_CANDIDATE_PATTERN.lastIndex = 0;
  for (const match of source.matchAll(URI_CANDIDATE_PATTERN)) {
    const candidate = match[0];
    const state = credentialUriState(candidate);
    if (state === "unsafe") return { text: source, count, unsafe: true };
    if (state !== "credential") continue;
    const start = match.index ?? 0;
    text += source.slice(cursor, start);
    text += REDACTED_CREDENTIAL;
    cursor = start + candidate.length;
    count += 1;
  }
  if (count === 0) return { text: source, count: 0, unsafe: false };
  text += source.slice(cursor);
  return { text, count, unsafe: false };
}

function lineEndIndex(value: string, start: number) {
  const carriageReturn = value.indexOf("\r", start);
  const lineFeed = value.indexOf("\n", start);
  if (carriageReturn === -1) return lineFeed === -1 ? value.length : lineFeed;
  if (lineFeed === -1) return carriageReturn;
  return Math.min(carriageReturn, lineFeed);
}

function balancedValueEnd(value: string, start: number) {
  const closingFor: Record<string, string> = {
    "(": ")",
    "[": "]",
    "{": "}",
  };
  const stack = [closingFor[value[start]]];
  let quote = "";
  let escaped = false;

  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === "\"" || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (closingFor[character]) {
      stack.push(closingFor[character]);
      continue;
    }
    if (character === stack.at(-1)) {
      stack.pop();
      if (stack.length === 0) return index + 1;
    }
  }
  return null;
}

function credentialValueEnd(value: string, start: number) {
  const endOfLine = lineEndIndex(value, start);
  if (start >= endOfLine) return endOfLine;

  function includeConcatenatedSuffix(end: number) {
    const valueLineEnd = lineEndIndex(value, end);
    return value.slice(end, valueLineEnd).trim() ? valueLineEnd : end;
  }

  const firstCharacter = value[start];
  if (
    value.startsWith('"""', start) ||
    value.startsWith("'''", start) ||
    value.startsWith("```", start)
  ) {
    return null;
  }
  if (firstCharacter === "\"" || firstCharacter === "'" || firstCharacter === "`") {
    let escaped = false;
    for (let index = start + 1; index < endOfLine; index += 1) {
      const character = value[index];
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === firstCharacter) {
        return includeConcatenatedSuffix(index + 1);
      }
    }
    return null;
  }
  if (
    (firstCharacter === "|" || firstCharacter === ">") &&
    /^[|>][-+\d]*[ \t]*$/.test(value.slice(start, endOfLine))
  ) {
    return null;
  }
  if (value.startsWith("<<", start)) return null;
  if (firstCharacter === "{" || firstCharacter === "[" || firstCharacter === "(") {
    const end = balancedValueEnd(value, start);
    return end === null ? null : includeConcatenatedSuffix(end);
  }
  if (value.slice(start, endOfLine).trimEnd().endsWith("\\")) return null;
  if (containsAmbiguousCredentialUri(value.slice(start, endOfLine))) return null;
  return endOfLine;
}

function redactAssignments(
  source: string,
  pattern: RegExp,
): RedactionResult {
  let text = source;
  let count = 0;
  pattern.lastIndex = 0;

  while (true) {
    const match = pattern.exec(text);
    if (match === null) break;
    if (!isSensitiveAssignmentLabel(match[3])) continue;

    const replacementStart = match.index + match[1].length;
    const valueEnd = credentialValueEnd(text, pattern.lastIndex);
    if (valueEnd === null) {
      return { text, count, unsafe: true };
    }
    text = `${text.slice(0, replacementStart)}${REDACTED_CREDENTIAL}${text.slice(valueEnd)}`;
    count += 1;
    pattern.lastIndex = replacementStart + REDACTED_CREDENTIAL.length;
  }

  return { text, count, unsafe: false };
}

function redactSensitiveEvidence(value: string): RedactionResult {
  let text = value;
  let count = 0;

  function redact(pattern: RegExp, replacement = REDACTED_CREDENTIAL) {
    text = text.replace(pattern, () => {
      count += 1;
      return replacement;
    });
  }

  redact(
    /-----BEGIN ([A-Z0-9 -]*(?:PRIVATE|PUBLIC) KEY(?: BLOCK)?)-----[\s\S]*?-----END \1-----/gi,
  );
  if (
    /-----\s*(?:BEGIN|END)\s+[A-Z0-9 -]*(?:PRIVATE|PUBLIC) KEY(?: BLOCK)?-----/i.test(text)
  ) {
    return { text, count, unsafe: true };
  }

  redact(
    /^[ \t]*(?:proxy-authorization|authorization|set-cookie|cookie)[ \t]*:[^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*/gim,
  );

  for (const pattern of [ASSIGNMENT_PATTERN, SPACE_ASSIGNMENT_PATTERN]) {
    const result = redactAssignments(text, pattern);
    text = result.text;
    count += result.count;
    if (result.unsafe) return { text, count, unsafe: true };
  }

  const credentialUris = redactCredentialUris(text);
  text = credentialUris.text;
  count += credentialUris.count;
  if (credentialUris.unsafe) return { text, count, unsafe: true };

  redact(
    /\b(?:Bearer|Basic)[ \t]+[A-Za-z0-9._~+/=-]{8,}(?=$|[\s,;:)"'\]}])/gim,
  );
  redact(/\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g);
  redact(/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{16,}\b/g);
  redact(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g);
  redact(/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g);
  redact(/\bgh[pousr]_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/g);
  redact(/\bxox[baprs]-[A-Za-z0-9-]{16,}\b/g);
  redact(/\b(?:AIza[0-9A-Za-z_-]{20,}|glpat-[A-Za-z0-9_-]{20,}|hf_[A-Za-z0-9]{20,}|npm_[A-Za-z0-9]{20,})\b/g);
  redact(/\b\d{3}-\d{2}-\d{4}\b/g, REDACTED_PERSONAL_DATA);
  redact(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED_PERSONAL_DATA);
  redact(/(?<!\d)(?:\+?1[ .-]?)?(?:\(\d{3}\)|\d{3}[ .-])\s*\d{3}[ .-]\d{4}(?!\d)/g, REDACTED_PERSONAL_DATA);
  redact(/\b\d{1,6}\s+(?:[A-Z0-9.'-]+\s+){0,5}(?:STREET|ST|AVENUE|AVE|ROAD|RD|BOULEVARD|BLVD|LANE|LN|DRIVE|DR|COURT|CT|WAY|PARKWAY|PKWY)\b(?:\s+(?:APT|SUITE|UNIT|#)\s*[A-Z0-9-]+)?/gi, REDACTED_PERSONAL_DATA);
  redact(/\b(?:BANK\s+ACCOUNT|ACCOUNT\s+NUMBER|ROUTING\s+NUMBER|ABA)\s*[:#]?\s*(?:[A-Z0-9][ -]?){6,34}(?=$|[\s,;.)])/gim, REDACTED_PERSONAL_DATA);
  redact(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g, REDACTED_PERSONAL_DATA);
  redact(/\b\d{8,17}\b/g, REDACTED_PERSONAL_DATA);
  redact(/\b(?:EIN|TIN)\s*[:#]?\s*\d{2}-\d{7}\b/gi, REDACTED_PERSONAL_DATA);
  redact(/\bUEI\s*[:#]?\s*[A-Z0-9]{12}\b/gi, REDACTED_PERSONAL_DATA);
  redact(/\b(?=[A-Z0-9]{12}\b)(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{12}\b/g, REDACTED_PERSONAL_DATA);
  redact(/\bCAGE(?:\s+CODE)?\s*[:#]?\s*[A-Z0-9]{5}\b/gi, REDACTED_PERSONAL_DATA);

  return { text, count, unsafe: false };
}

function hasUsefulEvidence(value: string) {
  const remaining = value
    .replace(/\[REDACTED_[A-Z_]+\]/g, " ")
    .replace(/\b(?:ssn|ein|tin|uei|cage|code)\b/gi, " ")
    .replace(/[^a-z0-9]+/gi, " ");
  return /[a-z]{3,}/i.test(remaining);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFounderProfileField(value: unknown): value is FounderProfileProposalField {
  return typeof value === "string" && PROFILE_FIELD_SET.has(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]) {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isTextItem(
  value: unknown,
  type: "reasoning_text" | "summary_text",
) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["type", "text"]) &&
    value.type === type &&
    typeof value.text === "string"
  );
}

function isInertReasoningItem(value: Record<string, unknown>) {
  if (
    !hasOnlyKeys(value, [
      "type",
      "id",
      "status",
      "summary",
      "content",
      "encrypted_content",
    ]) ||
    value.type !== "reasoning" ||
    (value.id !== undefined && typeof value.id !== "string") ||
    (value.status !== undefined &&
      value.status !== null &&
      value.status !== "completed") ||
    !Array.isArray(value.summary) ||
    !value.summary.every((item) => isTextItem(item, "summary_text")) ||
    (value.content !== undefined &&
      value.content !== null &&
      (!Array.isArray(value.content) ||
        !value.content.every((item) => isTextItem(item, "reasoning_text")))) ||
    (value.encrypted_content !== undefined &&
      value.encrypted_content !== null &&
      typeof value.encrypted_content !== "string")
  ) {
    return false;
  }
  return true;
}

export function isJsonWithoutDuplicateKeys(value: string) {
  let index = 0;
  let valid = true;

  function skipWhitespace() {
    while (/[\t\n\r ]/.test(value[index] ?? "")) index += 1;
  }

  function parseString(): string | null {
    if (value[index] !== "\"") return null;
    const start = index;
    index += 1;
    while (index < value.length) {
      if (value[index] === "\\") {
        index += 2;
        continue;
      }
      if (value[index] === "\"") {
        index += 1;
        try {
          return JSON.parse(value.slice(start, index)) as string;
        } catch {
          return null;
        }
      }
      index += 1;
    }
    return null;
  }

  function parseArray(depth: number) {
    index += 1;
    skipWhitespace();
    if (value[index] === "]") {
      index += 1;
      return;
    }
    while (valid) {
      parseValue(depth + 1);
      skipWhitespace();
      if (value[index] === "]") {
        index += 1;
        return;
      }
      if (value[index] !== ",") {
        valid = false;
        return;
      }
      index += 1;
      skipWhitespace();
    }
  }

  function parseObject(depth: number) {
    index += 1;
    const keys = new Set<string>();
    skipWhitespace();
    if (value[index] === "}") {
      index += 1;
      return;
    }
    while (valid) {
      const key = parseString();
      if (key === null || keys.has(key)) {
        valid = false;
        return;
      }
      keys.add(key);
      skipWhitespace();
      if (value[index] !== ":") {
        valid = false;
        return;
      }
      index += 1;
      skipWhitespace();
      parseValue(depth + 1);
      skipWhitespace();
      if (value[index] === "}") {
        index += 1;
        return;
      }
      if (value[index] !== ",") {
        valid = false;
        return;
      }
      index += 1;
      skipWhitespace();
    }
  }

  function parseValue(depth: number) {
    if (depth > 64) {
      valid = false;
      return;
    }
    skipWhitespace();
    const character = value[index];
    if (character === "{") {
      parseObject(depth);
      return;
    }
    if (character === "[") {
      parseArray(depth);
      return;
    }
    if (character === "\"") {
      if (parseString() === null) valid = false;
      return;
    }
    const remaining = value.slice(index);
    const token = remaining.match(
      /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/,
    )?.[0];
    if (!token) {
      valid = false;
      return;
    }
    index += token.length;
  }

  parseValue(0);
  skipWhitespace();
  return valid && index === value.length;
}

export function sanitizeEvidenceForExternalProcessing(value: string) {
  const redacted = redactSensitiveEvidence(value);
  return {
    text: redacted.text,
    redactionCount: redacted.count,
    unsafe: redacted.unsafe,
    usable: !redacted.unsafe && hasUsefulEvidence(redacted.text),
  };
}

export function readCompletedOutputText(responseBody: unknown): string | null {
  if (
    !isRecord(responseBody) ||
    responseBody.status !== "completed" ||
    (responseBody.error !== undefined && responseBody.error !== null) ||
    (responseBody.incomplete_details !== undefined &&
      responseBody.incomplete_details !== null) ||
    !Array.isArray(responseBody.output)
  ) {
    return null;
  }

  let message: Record<string, unknown> | null = null;
  for (const output of responseBody.output) {
    if (!isRecord(output)) return null;
    if (output.type === "reasoning") {
      if (!isInertReasoningItem(output)) return null;
      continue;
    }
    if (output.type !== "message" || message !== null) return null;
    message = output;
  }
  if (
    message === null ||
    !hasOnlyKeys(message, ["type", "id", "role", "status", "content", "phase"]) ||
    message.type !== "message" ||
    (message.id !== undefined && typeof message.id !== "string") ||
    message.role !== "assistant" ||
    (message.phase !== undefined &&
      message.phase !== null &&
      message.phase !== "final_answer") ||
    message.status !== "completed" ||
    !Array.isArray(message.content) ||
    message.content.length !== 1
  ) {
    return null;
  }
  const outputText = message.content[0];
  if (
    !isRecord(outputText) ||
    !hasOnlyKeys(outputText, ["type", "text", "annotations", "logprobs"]) ||
    outputText.type !== "output_text" ||
    typeof outputText.text !== "string" ||
    (outputText.annotations !== undefined && !Array.isArray(outputText.annotations)) ||
    (outputText.logprobs !== undefined && !Array.isArray(outputText.logprobs))
  ) {
    return null;
  }
  return outputText.text;
}

function isClaimKind(value: unknown): value is FounderEvidenceClaimKind {
  return value === "verbatim" || value === "inferred" || value === "summarized";
}

function claimKindIsAllowed(
  kind: FounderEvidenceClaimKind,
  field: FounderProfileProposalField,
): boolean {
  switch (kind) {
    case "verbatim":
      return true;
    case "inferred":
      return INFERRED_PROFILE_FIELDS.has(field) || INFERRED_AMOUNT_FIELDS.has(field);
    case "summarized":
      return field === "description";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function readStructuredClaims(
  responseBody: unknown,
  evidenceText: string,
): StructuredClaim[] | null {
  const outputText = readCompletedOutputText(responseBody);
  if (outputText === null) return null;
  let parsed: unknown;
  try {
    if (!isJsonWithoutDuplicateKeys(outputText)) return null;
    parsed = JSON.parse(outputText);
  } catch {
    return null;
  }
  if (
    !isRecord(parsed) ||
    Object.keys(parsed).length !== 1 ||
    !Array.isArray(parsed.claims)
  ) {
    return null;
  }

  const claims: StructuredClaim[] = [];
  const populatedFields = new Set<FounderProfileProposalField>();
  for (const claim of parsed.claims) {
    const parsedClaim = readUsableClaim(claim, evidenceText, populatedFields);
    if (!parsedClaim) continue;
    populatedFields.add(parsedClaim.field);
    claims.push(parsedClaim);
  }
  if (parsed.claims.length > 0 && claims.length === 0) return null;
  return claims;
}

function readUsableClaim(
  claim: unknown,
  evidenceText: string,
  populatedFields: ReadonlySet<FounderProfileProposalField>,
): StructuredClaim | null {
  if (!isRecord(claim)) return null;
  const keys = Object.keys(claim).sort().join(",");
  if (keys !== "evidenceExcerpt,field,value" && keys !== "evidenceExcerpt,field,kind,value") {
    return null;
  }
  const kind: FounderEvidenceClaimKind = isClaimKind(claim.kind) ? claim.kind : "verbatim";
  if (
    !isFounderProfileField(claim.field) ||
    typeof claim.value !== "string" ||
    typeof claim.evidenceExcerpt !== "string" ||
    (claim.kind !== undefined && !isClaimKind(claim.kind))
  ) {
    return null;
  }
  const value = claim.value;
  const evidenceExcerpt = claim.evidenceExcerpt;
  if (
    !value.trim() ||
    !evidenceExcerpt.trim() ||
    value !== value.trim() ||
    evidenceExcerpt !== evidenceExcerpt.trim() ||
    !evidenceText.includes(evidenceExcerpt) ||
    !claimKindIsAllowed(kind, claim.field) ||
    populatedFields.has(claim.field)
  ) {
    return null;
  }
  if (kind === "verbatim" && !evidenceExcerpt.includes(value)) return null;
  if (kind === "inferred" && INFERRED_AMOUNT_FIELDS.has(claim.field)
    && !excerptSupportsMappedAmount(evidenceExcerpt, value)) {
    return null;
  }
  if ((kind === "inferred" || kind === "summarized") && value.length > MAX_MAPPED_VALUE_CHARS) {
    return null;
  }
  if (claim.field === "description" && kind === "verbatim"
    && (value.length > MAX_VERBATIM_DESCRIPTION_CHARS || value.length > evidenceText.length / 2)) {
    return null;
  }
  return {
    field: claim.field,
    value,
    evidenceExcerpt,
    kind,
  };
}

function responseRequestBody(evidenceText: string) {
  return {
    model: LUNA_MODEL,
    store: false,
    instructions: EXTRACTION_POLICY,
    input: [{
      role: "user",
      content: [{
        type: "input_text",
        text: evidenceText,
      }],
    }],
    text: {
      format: {
        type: "json_schema",
        name: "founder_profile_evidence",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["claims"],
          properties: {
            claims: {
              type: "array",
              description:
                "Verbatim, inferred, or summarized founder-profile claims supported by the supplied evidence. Omit unsupported fields.",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["field", "value", "evidenceExcerpt", "kind"],
                properties: {
                  field: {
                    type: "string",
                    enum: FOUNDER_PROFILE_FIELDS,
                  },
                  kind: {
                    type: "string",
                    enum: ["verbatim", "inferred", "summarized"],
                    description:
                      "verbatim copies an exact substring. inferred maps categorical fields or restates a dollar amount. summarized is description only.",
                  },
                  value: {
                    type: "string",
                    description:
                      "For verbatim, an exact contiguous substring of evidenceExcerpt. For inferred or summarized, a short mapped or summarized value supported by evidenceExcerpt.",
                  },
                  evidenceExcerpt: {
                    type: "string",
                    description:
                      "An exact contiguous substring copied verbatim from the supplied evidence that supports value.",
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

export async function extractFounderEvidence(
  input: FounderEvidenceExtractionInput,
  dependencies: LunaExtractionDependencies = {},
): Promise<FounderEvidenceExtractionResult> {
  const redacted = redactSensitiveEvidence(input.evidenceText);
  if (redacted.unsafe) {
    return fallback("sensitive_evidence", redacted.count);
  }
  if (!hasUsefulEvidence(redacted.text)) {
    return fallback(redacted.count > 0 ? "sensitive_evidence" : "invalid_evidence", redacted.count);
  }

  const apiKey = (dependencies.apiKey ?? process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) return fallback("missing_api_key", redacted.count);

  const fetcher = dependencies.fetcher ?? fetch;
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutFailure = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error("Provider request timed out."));
    }, timeoutMs);
  });

  let phase: "fetch" | "body" = "fetch";
  let responseBody: unknown;
  try {
    const response = await Promise.race([
      fetcher(`${OPENAI_BASE_URL}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(responseRequestBody(redacted.text)),
        signal: controller.signal,
      }),
      timeoutFailure,
    ]);
    if (!response.ok) return fallback("provider_error", redacted.count, true);

    phase = "body";
    responseBody = await Promise.race([response.json(), timeoutFailure]);
  } catch {
    const reason = timedOut
      ? "timeout"
      : phase === "body"
        ? "schema_failure"
        : "provider_error";
    return fallback(reason, redacted.count, true);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }

  const claims = readStructuredClaims(responseBody, redacted.text);
  if (claims === null) return fallback("schema_failure", redacted.count, true);

  const proposedProfile = blankProfile();
  const evidence: FounderEvidenceClaim[] = [];
  for (const claim of claims) {
    proposedProfile[claim.field] = claim.value;
    evidence.push({
      field: claim.field,
      value: claim.value,
      evidenceExcerpt: claim.evidenceExcerpt,
      kind: claim.kind,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
    });
  }

  return {
    proposedProfile,
    evidence,
    externalProcessing: {
      attempted: true,
      completed: true,
      reason: null,
      redactionCount: redacted.count,
      provider: "openai",
      model: LUNA_MODEL,
    },
  };
}
