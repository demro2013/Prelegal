import { describe, expect, it } from "vitest";
import { applyUpdates } from "./chat";

describe("applyUpdates", () => {
  const values = { governingLaw: "Delaware", "party1.name": "Ada Stone" };

  it("changes nothing without updates", () => {
    expect(applyUpdates(values, [])).toEqual(values);
  });

  it("applies each update and leaves other values alone", () => {
    expect(
      applyUpdates(values, [
        { key: "governingLaw", value: "California" },
        { key: "party2.name", value: "Sam Reed" },
      ]),
    ).toEqual({
      governingLaw: "California",
      "party1.name": "Ada Stone",
      "party2.name": "Sam Reed",
    });
  });

  it("lets an empty string clear an optional field", () => {
    expect(applyUpdates({ fees: "$5" }, [{ key: "fees", value: "" }])).toEqual({
      fees: "",
    });
  });

  it("doesn't change the values it was given", () => {
    const snapshot = structuredClone(values);
    applyUpdates(values, [{ key: "governingLaw", value: "California" }]);
    expect(values).toEqual(snapshot);
  });
});
