import type { AgreementTemplates } from "./document";

/** One entry in documents/documents.json, shared with the backend. */
export type FieldDefinition = {
  key: string;
  label: string;
  description: string;
  type: "text" | "date" | "years" | "choice";
  required: boolean;
  options?: string[];
  requiredWhen?: { key: string; equals: string };
  /** "today" means the current date. */
  default?: string;
  section?: string;
};

export type DocumentDefinition = {
  id: string;
  name: string;
  shortName: string;
  summary: string;
  termsFile: string;
  coverFile?: string;
  termsTitle?: string;
  coverTitle: string;
  roles: [{ name: string; description: string }, { name: string; description: string }];
  fields: FieldDefinition[];
};

/** Field values by key. Party details use keys such as `party1.company`. */
export type Values = Record<string, string>;

/** Keyed by field, in the order to show them. */
export type DocumentErrors = Record<string, string>;

const PARTY_LABELS = {
  company: "company",
  name: "name",
  title: "title",
  noticeAddress: "notice address",
};

export function partyKey(number: 1 | 2, field: keyof typeof PARTY_LABELS) {
  return `party${number}.${field}`;
}

const PARTY_KEYS = new Set(
  ([1, 2] as const).flatMap((number) =>
    (Object.keys(PARTY_LABELS) as (keyof typeof PARTY_LABELS)[]).map((field) =>
      partyKey(number, field),
    ),
  ),
);

export function partyValues(values: Values): Values {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => PARTY_KEYS.has(key)),
  );
}

/** Fills empty fields with their defaults, so suggestions show straight away. */
export function withDefaults(
  document: DocumentDefinition,
  values: Values,
  today: string,
): Values {
  const defaults = Object.fromEntries(
    document.fields.flatMap(({ key, default: value }) =>
      value ? [[key, value === "today" ? today : value]] : [],
    ),
  );
  return {
    ...values,
    ...Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [key, values[key] || value]),
    ),
  };
}

export function isValidYears(years: string): boolean {
  return /^[1-9]\d?$/.test(years.trim());
}

/**
 * The PDF uses the built-in Times fonts, which cover Windows-1252 only. Any
 * other character would print incorrectly, so it has to be caught up front.
 */
export const UNSUPPORTED_CHARACTER =
  /[^\t\n\r\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/u;

function checkCharacters(value: string, label: string): string | undefined {
  const unsupported = value.match(UNSUPPORTED_CHARACTER);
  return unsupported
    ? `${label}: Remove “${unsupported[0]}”. The PDF can’t display this character.`
    : undefined;
}

function checkField(field: FieldDefinition, values: Values): string | undefined {
  const value = (values[field.key] ?? "").trim();
  const { requiredWhen } = field;
  const isUsed = !requiredWhen || values[requiredWhen.key] === requiredWhen.equals;
  if (!isUsed) return undefined;

  if (!value) {
    return field.required ? `${field.label} is still needed.` : undefined;
  }
  if (field.type === "years" && !isValidYears(value)) {
    return `${field.label}: Enter a whole number of years from 1 to 99.`;
  }
  if (field.type === "date" && !/^(19|20)\d{2}-\d{2}-\d{2}$/.test(value)) {
    return `${field.label}: Enter a date with a year from 1900 to 2099.`;
  }
  return checkCharacters(value, field.label);
}

/** Returns one message per invalid field, in the order the document lists them. */
export function validateDocument(
  document: DocumentDefinition,
  values: Values,
): DocumentErrors {
  const checks: [string, string | undefined][] = document.fields.map((field) => [
    field.key,
    checkField(field, values),
  ]);

  document.roles.forEach((role, index) => {
    const number = (index + 1) as 1 | 2;
    for (const [field, text] of Object.entries(PARTY_LABELS)) {
      const key = partyKey(number, field as keyof typeof PARTY_LABELS);
      const value = (values[key] ?? "").trim();
      const label = `${role.name} ${text}`;
      checks.push([
        key,
        value ? checkCharacters(value, label) : `${label} is still needed.`,
      ]);
    }
  });

  return Object.fromEntries(
    checks.filter((check): check is [string, string] => Boolean(check[1])),
  );
}

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function documentFilename(
  document: DocumentDefinition,
  values: Values,
): string {
  const companies = [
    values[partyKey(1, "company")] ?? "",
    values[partyKey(2, "company")] ?? "",
  ].map(slug);
  return [slug(document.shortName), ...companies.filter(Boolean)].join("-") + ".pdf";
}

export async function fetchTemplates(id: string): Promise<AgreementTemplates> {
  const response = await fetch(`/templates/${id}.json`);
  if (!response.ok) {
    throw new Error(`Template request failed with status ${response.status}`);
  }
  return response.json();
}
