import { describe, expect, it } from "vitest";
import { applyUpdates, describeErrors } from "./chat";
import { defaultValues, validateMnda, type MndaValues } from "./mnda";

const values: MndaValues = {
  ...defaultValues,
  governingLaw: "Delaware",
  parties: [
    { name: "Ada Stone", title: "CEO", company: "Acme", noticeAddress: "a@a.example" },
    { name: "Sam Reed", title: "COO", company: "Globex", noticeAddress: "s@g.example" },
  ],
};

describe("applyUpdates", () => {
  it("changes nothing when every update is null", () => {
    const updated = applyUpdates(values, {
      governingLaw: null,
      termType: null,
      party1: null,
      party2: { name: null, title: null, company: null, noticeAddress: null },
    });
    expect(updated).toEqual(values);
  });

  it("applies the fields that are present", () => {
    const updated = applyUpdates(values, {
      governingLaw: "California",
      termType: "untilTerminated",
    });
    expect(updated.governingLaw).toBe("California");
    expect(updated.termType).toBe("untilTerminated");
    expect(updated.jurisdiction).toBe(values.jurisdiction);
  });

  it("merges each party separately, field by field", () => {
    const updated = applyUpdates(values, {
      party2: { name: "Kim Lee", title: null },
    });
    expect(updated.parties[0]).toEqual(values.parties[0]);
    expect(updated.parties[1]).toEqual({ ...values.parties[1], name: "Kim Lee" });
  });

  it("lets an empty string clear modifications", () => {
    const updated = applyUpdates(
      { ...values, modifications: "Section 3 is removed." },
      { modifications: "" },
    );
    expect(updated.modifications).toBe("");
  });

  it("doesn't change the values it was given", () => {
    const snapshot = structuredClone(values);
    applyUpdates(values, { party1: { name: "Kim Lee" }, purpose: "Testing" });
    expect(values).toEqual(snapshot);
  });

  it("keeps the two empty default parties independent", () => {
    const updated = applyUpdates(defaultValues, { party1: { name: "Kim Lee" } });
    expect(updated.parties[0].name).toBe("Kim Lee");
    expect(updated.parties[1].name).toBe("");
    expect(defaultValues.parties[0].name).toBe("");
  });
});

describe("describeErrors", () => {
  it("names the field, and the party for party fields", () => {
    expect(
      describeErrors({
        governingLaw: "Enter the governing law.",
        "parties.1.company": "Enter a company.",
      }),
    ).toEqual([
      "Governing law: Enter the governing law.",
      "Party 2 company: Enter a company.",
    ]);
  });

  it("has a label for every field validateMnda can report", () => {
    const invalid: MndaValues = {
      ...defaultValues,
      purpose: "",
      effectiveDate: "",
      termYears: "",
      confidentialityYears: "",
      modifications: "Č",
    };
    const descriptions = describeErrors(validateMnda(invalid));
    expect(descriptions).toHaveLength(15);
    for (const description of descriptions) {
      expect(description).toMatch(/^[A-Z][^:]+: /);
      expect(description).not.toMatch(/^undefined/);
    }
  });
});
