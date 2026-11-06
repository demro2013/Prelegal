import type { Agreement, AgreementTemplates, Block, Inline } from "./document";
import {
  partyKey,
  type DocumentDefinition,
  type FieldDefinition,
  type Values,
} from "./documents";
import { field, fillCoverPage, formatDate, type MndaValues } from "./mnda";

export const NOT_SPECIFIED = "Not specified";

const CC_BY = "https://creativecommons.org/licenses/by/4.0/";

const text = (value: string): Inline => ({ type: "text", text: value });

function fieldBlock({ key, label, required, type }: FieldDefinition, values: Values): Block {
  const value = (values[key] ?? "").trim();
  if (!value && !required) {
    return { type: "paragraph", content: [text(NOT_SPECIFIED)] };
  }
  const shown = value && type === "date" ? formatDate(value) : value;
  return { type: "paragraph", content: [field(shown, `[${label}]`)] };
}

const PARTY_ROWS = [
  ["Signature"],
  ["Print Name", "name"],
  ["Title", "title"],
  ["Company", "company"],
  ["Notice Address", "noticeAddress"],
  ["Date"],
] as const;

function partyTable(document: DocumentDefinition, values: Values): Block {
  const [first, second] = document.roles;
  return {
    type: "table",
    header: [[], [text(first.name.toUpperCase())], [text(second.name.toUpperCase())]],
    rows: PARTY_ROWS.map(([label, key]) => [
      [text(label)],
      [field(key ? (values[partyKey(1, key)] ?? "") : "", "")],
      [field(key ? (values[partyKey(2, key)] ?? "") : "", "")],
    ]),
  };
}

/**
 * The page for a document with no cover template. It lists each deal value
 * under the name the Standard Terms use for it, followed by the signatures.
 */
export function buildKeyTermsPage(
  document: DocumentDefinition,
  values: Values,
): Block[] {
  const { name, coverTitle, termsTitle, shortName } = document;
  const blocks: Block[] = [{ type: "heading", level: 1, content: [text(name)] }];
  // Sections already name the page's parts, such as Order Form and Key Terms.
  if (!document.fields.some((definition) => definition.section)) {
    blocks.push({ type: "heading", level: 2, content: [text(coverTitle)] });
  }

  let section: string | undefined;
  for (const definition of document.fields) {
    if (definition.section && definition.section !== section) {
      section = definition.section;
      blocks.push({ type: "heading", level: 2, content: [text(section)] });
    }
    blocks.push(
      { type: "heading", level: 3, content: [text(definition.label)] },
      fieldBlock(definition, values),
    );
  }

  blocks.push(
    {
      type: "paragraph",
      content: [
        text(
          `By signing below, each party agrees to enter into this agreement, which incorporates the ${termsTitle ?? `${shortName} Standard Terms`} that follow.`,
        ),
      ],
    },
    partyTable(document, values),
    {
      type: "paragraph",
      content: [
        text("This page was generated using Prelegal. The Standard Terms are unmodified. They were created by Common Paper and are used under "),
        { type: "link", text: "CC BY 4.0", href: CC_BY },
        text("."),
      ],
    },
  );
  return blocks;
}

function toMndaValues(values: Values): MndaValues {
  const party = (number: 1 | 2) => ({
    name: values[partyKey(number, "name")] ?? "",
    title: values[partyKey(number, "title")] ?? "",
    company: values[partyKey(number, "company")] ?? "",
    noticeAddress: values[partyKey(number, "noticeAddress")] ?? "",
  });
  return {
    purpose: values.purpose ?? "",
    effectiveDate: values.effectiveDate ?? "",
    termType: values.termType === "untilTerminated" ? "untilTerminated" : "fixed",
    termYears: values.termYears ?? "",
    confidentialityType:
      values.confidentialityType === "perpetual" ? "perpetual" : "fixed",
    confidentialityYears: values.confidentialityYears ?? "",
    governingLaw: values.governingLaw ?? "",
    jurisdiction: values.jurisdiction ?? "",
    modifications: values.modifications ?? "",
    parties: [party(1), party(2)],
  };
}

export function buildAgreement(
  document: DocumentDefinition,
  templates: AgreementTemplates,
  values: Values,
): Agreement {
  return {
    coverPage: templates.coverPage
      ? fillCoverPage(templates.coverPage, toMndaValues(values))
      : buildKeyTermsPage(document, values),
    standardTerms: templates.standardTerms,
  };
}
