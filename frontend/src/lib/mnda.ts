import { inlineText, type Block, type Inline } from "./document";

export type Party = {
  name: string;
  title: string;
  company: string;
  noticeAddress: string;
};

export type MndaValues = {
  purpose: string;
  /** ISO date (YYYY-MM-DD). */
  effectiveDate: string;
  termType: "fixed" | "untilTerminated";
  termYears: string;
  confidentialityType: "fixed" | "perpetual";
  confidentialityYears: string;
  governingLaw: string;
  jurisdiction: string;
  modifications: string;
  parties: [Party, Party];
};

/** The parsed templates, or the agreement once the Cover Page is filled in. */
export type MndaDocument = {
  coverPage: Block[];
  standardTerms: Block[];
};

/** Keyed by form field name, such as `purpose` or `parties.0.company`. */
export type MndaErrors = Record<string, string>;

const emptyParty: Party = {
  name: "",
  title: "",
  company: "",
  noticeAddress: "",
};

export const defaultValues: MndaValues = {
  purpose:
    "Evaluating whether to enter into a business relationship with the other party.",
  effectiveDate: "",
  termType: "fixed",
  termYears: "1",
  confidentialityType: "fixed",
  confidentialityYears: "1",
  governingLaw: "",
  jurisdiction: "",
  modifications: "",
  parties: [emptyParty, emptyParty],
};

const COMPLETION_NOTICE =
  "Cover Page completed using Prelegal. The Standard Terms are unmodified.";

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  // Date.UTC would read a partly typed year such as 0026 as 1926.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}

function formatYears(years: string): string {
  return Number(years) === 1 ? "1 year" : `${Number(years)} years`;
}

function field(value: string, blank: string): Inline {
  return value.trim()
    ? { type: "field", text: value.trim(), filled: true }
    : { type: "field", text: blank, filled: false };
}

function yearsField(years: string, blank: string): Inline {
  return isValidYears(years)
    ? { type: "field", text: formatYears(years), filled: true }
    : { type: "field", text: blank, filled: false };
}

const PARTY_ROWS: Record<string, keyof Party> = {
  "Print Name": "name",
  Title: "title",
  Company: "company",
  "Notice Address": "noticeAddress",
};

function fillPartyTable(
  block: Extract<Block, { type: "table" }>,
  parties: MndaValues["parties"],
): Block {
  return {
    ...block,
    rows: block.rows.map((row) => {
      const [label, ...cells] = row;
      const key = PARTY_ROWS[label[0] ? label[0].text.trim() : ""];
      if (!key) return row;
      return [
        label,
        ...cells.map((_, index) => [field(parties[index][key], "")]),
      ];
    }),
  };
}

/**
 * Applies form values to the parsed Cover Page.
 *
 * Unselected term options keep the template's wording, so the finished page
 * shows both choices with only the selected one checked.
 */
export function fillCoverPage(
  blocks: Block[],
  values: MndaValues,
): Block[] {
  let section = "";
  let optionIndex = 0;

  const isSelected = (index: number) => {
    if (section === "MNDA Term") {
      return (index === 0) === (values.termType === "fixed");
    }
    if (section === "Term of Confidentiality") {
      return (index === 0) === (values.confidentialityType === "fixed");
    }
    return false;
  };

  const fillPlaceholder = (text: string, selected: boolean): Inline => {
    const blank = `[${text}]`;
    if (section === "Purpose") return field(values.purpose, blank);
    if (section === "Effective Date") {
      return field(
        values.effectiveDate && formatDate(values.effectiveDate),
        blank,
      );
    }
    if (section === "MNDA Term" || section === "Term of Confidentiality") {
      if (!selected) return { type: "text", text: blank };
      return yearsField(
        section === "MNDA Term"
          ? values.termYears
          : values.confidentialityYears,
        blank,
      );
    }
    if (text.startsWith("Fill in state")) {
      return field(values.governingLaw, blank);
    }
    if (text.startsWith("Fill in city")) {
      return field(values.jurisdiction, blank);
    }
    return { type: "placeholder", text };
  };

  const fillContent = (content: Inline[], selected = false): Inline[] =>
    content.map((inline) =>
      inline.type === "placeholder"
        ? fillPlaceholder(inline.text, selected)
        : inline,
    );

  const filled = blocks.map((block): Block => {
    switch (block.type) {
      case "heading":
        section = inlineText(block.content);
        optionIndex = 0;
        return block;
      case "checkbox": {
        const selected = isSelected(optionIndex++);
        return {
          ...block,
          checked: selected,
          content: fillContent(block.content, selected),
        };
      }
      case "table":
        return fillPartyTable(block, values.parties);
      case "paragraph":
        if (inlineText(block.content) === "List any modifications to the MNDA") {
          return {
            ...block,
            content: [field(values.modifications.trim() || "None.", "")],
          };
        }
        return { ...block, content: fillContent(block.content) };
      default:
        return block;
    }
  });

  return [
    ...filled,
    {
      type: "paragraph",
      content: [{ type: "text", text: COMPLETION_NOTICE }],
    },
  ];
}

export function buildMndaDocument(
  templates: MndaDocument,
  values: MndaValues,
): MndaDocument {
  return {
    coverPage: fillCoverPage(templates.coverPage, values),
    standardTerms: templates.standardTerms,
  };
}

function isValidYears(years: string): boolean {
  return /^[1-9]\d?$/.test(years.trim());
}

/**
 * The PDF uses the built-in Times fonts, which cover Windows-1252 only. Any
 * other character would print incorrectly, so it has to be caught up front.
 */
const UNSUPPORTED_CHARACTER =
  /[^\t\n\r\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/u;

function checkText(value: string, label: string): string | undefined {
  if (!value.trim()) return `Enter ${label}.`;
  return checkCharacters(value);
}

function checkDate(isoDate: string): string | undefined {
  if (!isoDate) return "Choose the effective date.";
  return /^(19|20)\d{2}-\d{2}-\d{2}$/.test(isoDate)
    ? undefined
    : "Enter a year from 1900 to 2099.";
}

function checkCharacters(value: string): string | undefined {
  const unsupported = value.match(UNSUPPORTED_CHARACTER);
  return unsupported
    ? `Remove “${unsupported[0]}”. The PDF can’t display this character.`
    : undefined;
}

/** Returns one message per invalid field, in form order. */
export function validateMnda(values: MndaValues): MndaErrors {
  const checks: [string, string | undefined][] = [
    ["purpose", checkText(values.purpose, "the purpose")],
    ["effectiveDate", checkDate(values.effectiveDate)],
    [
      "termYears",
      values.termType === "fixed" && !isValidYears(values.termYears)
        ? "Enter a whole number of years from 1 to 99."
        : undefined,
    ],
    [
      "confidentialityYears",
      values.confidentialityType === "fixed" &&
      !isValidYears(values.confidentialityYears)
        ? "Enter a whole number of years from 1 to 99."
        : undefined,
    ],
    ["governingLaw", checkText(values.governingLaw, "the governing law")],
    ["jurisdiction", checkText(values.jurisdiction, "the jurisdiction")],
    ["modifications", checkCharacters(values.modifications)],
    ...values.parties.flatMap((party, index): [string, string | undefined][] => [
      [`parties.${index}.company`, checkText(party.company, "a company")],
      [`parties.${index}.name`, checkText(party.name, "a name")],
      [`parties.${index}.title`, checkText(party.title, "a title")],
      [
        `parties.${index}.noticeAddress`,
        checkText(party.noticeAddress, "an email or postal address"),
      ],
    ]),
  ];

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

export function mndaFilename(values: MndaValues): string {
  const companies = values.parties.map((party) => slug(party.company));
  return ["Mutual-NDA", ...companies.filter(Boolean)].join("-") + ".pdf";
}
