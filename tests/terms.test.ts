/**
 * @file tests/terms.test.ts
 * @desc checkTerms and diffTerms.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { checkTerms, diffTerms, type InviteTerms } from "../src/index.js";
import { iso } from "./fixtures.js";

const base: InviteTerms = {
  deliverables: ["a"],
  deadlines: [{ label: "d", at: iso(1) }],
  reminders: [{ deadline: "d", before: 0 }],
};

describe("checkTerms", () => {
  it("accepts consistent terms", () => {
    expect(checkTerms(base)).toBeNull();
    expect(checkTerms({ deliverables: [], deadlines: [], reminders: [] })).toBeNull();
  });

  it("rejects duplicate labels and unknown reminder deadlines", () => {
    expect(checkTerms({ ...base, deadlines: [...base.deadlines, ...base.deadlines] })).toMatch(
      /twice/,
    );
    expect(checkTerms({ ...base, reminders: [{ deadline: "x", before: 0 }] })).toMatch(/unknown/);
    expect(checkTerms({ ...base, reminders: [...base.reminders, ...base.reminders] })).toMatch(
      /twice/,
    );
  });
});

describe("diffTerms", () => {
  it("ignores key order and undefined fields", () => {
    const reordered = {
      reminders: base.reminders,
      role: undefined,
      deadlines: [{ at: iso(1), label: "d" }],
      deliverables: ["a"],
    };
    expect(diffTerms(base, reordered)).toEqual([]);
  });

  it("lists changed fields in sorted order", () => {
    expect(diffTerms(base, { ...base, role: "mapper", deliverables: ["b"] })).toEqual([
      { field: "deliverables", before: ["a"], after: ["b"] },
      { field: "role", after: "mapper" },
    ]);
  });

  it("compares nested values, nulls and extra fields", () => {
    const a = { ...base, extra: { n: [1, null] } } as InviteTerms;
    const b = { ...base, extra: { n: [1, 2] } } as InviteTerms;
    expect(diffTerms(a, b)).toEqual([
      { field: "extra", before: { n: [1, null] }, after: { n: [1, 2] } },
    ]);
  });
});
