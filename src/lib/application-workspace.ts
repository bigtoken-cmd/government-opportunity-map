export interface FounderContact {
  name: string;
  role: string;
  email: string;
}

export interface FounderContactQuestion {
  field: keyof FounderContact;
  prompt: string;
}

const CONTACT_QUESTIONS: Readonly<Record<keyof FounderContact, string>> = {
  name: "What is your name?",
  role: "What is your role at the company?",
  email: "What email should be used for this application?",
};
const MAX_FOUNDER_CONTACT_LENGTH = 320;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeFounderContact(value: unknown): FounderContact {
  return parseFounderContact(value) ?? {
    name: "",
    role: "",
    email: "",
  };
}

export function parseFounderContact(value: unknown): FounderContact | null {
  const contact = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const normalized = {
    name: text(contact.name),
    role: text(contact.role),
    email: text(contact.email),
  };
  if (
    Object.values(normalized).some((field) =>
      field.length > MAX_FOUNDER_CONTACT_LENGTH)
  ) {
    return null;
  }
  return normalized;
}

export function missingFounderContactQuestions(
  contact: FounderContact,
): FounderContactQuestion[] {
  return (Object.keys(CONTACT_QUESTIONS) as Array<keyof FounderContact>)
    .filter((field) => !contact[field])
    .map((field) => ({
      field,
      prompt: CONTACT_QUESTIONS[field],
    }));
}
