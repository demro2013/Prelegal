import type { MndaErrors, MndaValues, Party } from "./mnda";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type Nullable<T> = { [Key in keyof T]?: T[Key] | null };

/** Null or missing means "leave this field as it is". */
export type MndaUpdates = Nullable<Omit<MndaValues, "parties">> & {
  party1?: Nullable<Party> | null;
  party2?: Nullable<Party> | null;
};

export type ChatTurn = {
  reply: string;
  updates: MndaUpdates;
};

export const GREETING =
  "Hi! I’ll help you draft your Mutual NDA. Tell me about the agreement in your own words, or start here: which two companies are signing, and why will they share confidential information?";

/** Empty in production, where the backend serves the frontend. */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** Earlier details survive trimming because `values` holds them. */
const MAX_MESSAGES = 40;

export async function sendChat(
  messages: ChatMessage[],
  values: MndaValues,
  today: string,
): Promise<ChatTurn> {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: messages.slice(-MAX_MESSAGES),
      values,
      today,
    }),
  });
  if (!response.ok) {
    throw new Error(`Chat request failed with status ${response.status}`);
  }
  return response.json();
}

function withoutNulls<T extends object>(updates: T | null | undefined) {
  return Object.fromEntries(
    Object.entries(updates ?? {}).filter(([, value]) => value != null),
  ) as { [Key in keyof T]: NonNullable<T[Key]> };
}

export function applyUpdates(
  values: MndaValues,
  { party1, party2, ...fields }: MndaUpdates,
): MndaValues {
  const [first, second] = values.parties;
  return {
    ...values,
    ...withoutNulls(fields),
    parties: [
      { ...first, ...withoutNulls(party1) },
      { ...second, ...withoutNulls(party2) },
    ],
  };
}

const FIELD_LABELS: Record<string, string> = {
  purpose: "Purpose",
  effectiveDate: "Effective date",
  termYears: "MNDA term",
  confidentialityYears: "Term of confidentiality",
  governingLaw: "Governing law",
  jurisdiction: "Jurisdiction",
  modifications: "Modifications",
  company: "company",
  name: "name",
  title: "title",
  noticeAddress: "notice address",
};

function fieldLabel(field: string): string {
  const [, index, partyField] = field.match(/^parties\.(\d)\.(\w+)$/) ?? [];
  return partyField
    ? `Party ${Number(index) + 1} ${FIELD_LABELS[partyField]}`
    : FIELD_LABELS[field];
}

/** There's no form to point at, so each message names its field. */
export function describeErrors(errors: MndaErrors): string[] {
  return Object.entries(errors).map(
    ([field, message]) => `${fieldLabel(field)}: ${message}`,
  );
}
