import { inlineText, type Block, type Inline } from "./document";
import { isValidYears } from "./documents";

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

export function field(value: string, blank: string): Inline {
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
 * Applies values to the parsed Cover Page.
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
