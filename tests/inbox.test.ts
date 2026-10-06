/**
 * @file tests/inbox.test.ts
 * @desc inbox: grouping by whose turn it is, expired and finished invites in past, and sorting.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { type Invite, inbox } from "../src/index.js";
import { at, DAY, GUEST, HOST, invite, iso, STRANGER } from "./fixtures.js";

const ids = (list: Invite[]) => list.map((i) => i.id);
const noTimes = { deliverables: [], deadlines: [], reminders: [] };

describe("inbox", () => {
  const list = [
    invite("pending", { id: "p-late", expiresAt: iso(3 * DAY) }),
    invite("pending", { id: "p-soon", expiresAt: iso(2 * DAY) }),
    invite("countered", { id: "c", expiresAt: iso(2 * DAY) }),
    invite("pending", { id: "p-expired", expiresAt: iso(DAY / 2) }),
    invite("accepted", { id: "a-far" }),
    invite("accepted", { id: "a-near", terms: { ...noTimes, proposedTime: iso(2 * DAY) } }),
    invite("accepted", { id: "a-none", terms: noTimes }),
    invite("accepted", { id: "a-done", terms: { ...noTimes, proposedTime: iso(DAY / 2) } }),
    invite("declined", { id: "d-old" }),
    invite("cancelled", {
      id: "x-new",
      history: [
        ...invite().history,
        {
          at: iso(DAY / 4),
          by: HOST,
          action: "cancel",
          fromState: "pending",
          toState: "cancelled",
        },
      ],
    }),
    invite("pending", { id: "other", from: STRANGER, to: 4004, awaiting: 4004 }),
  ];

  it("groups and sorts the recipient's view", () => {
    const box = inbox(list, GUEST, at(DAY));
    expect(ids(box.needsMyAnswer)).toEqual(["p-soon", "p-late"]);
    expect(ids(box.waitingOnThem)).toEqual(["c"]);
    expect(ids(box.active)).toEqual(["a-near", "a-far", "a-none"]);
    expect(ids(box.past)).toEqual(["p-expired", "x-new", "a-done", "d-old"]);
  });

  it("flips for the sender and drops strangers' invites", () => {
    const box = inbox(list, HOST, at(DAY));
    expect(ids(box.needsMyAnswer)).toEqual(["c"]);
    expect(ids(box.waitingOnThem)).toEqual(["p-soon", "p-late"]);
    expect(inbox(list, 9999, at(DAY))).toEqual({
      needsMyAnswer: [],
      waitingOnThem: [],
      active: [],
      past: [],
    });
  });

  it("breaks ties by id and keeps input untouched", () => {
    const tied = [
      invite("pending", { id: "b" }),
      invite("pending", { id: "a" }),
      invite("accepted", { id: "z", terms: noTimes }),
      invite("accepted", { id: "y", terms: noTimes }),
      invite("declined", { id: "n" }),
      invite("declined", { id: "m" }),
    ];
    const copy = structuredClone(tied);
    const box = inbox(tied, GUEST, at(0));
    expect(ids(box.needsMyAnswer)).toEqual(["a", "b"]);
    expect(ids(box.active)).toEqual(["y", "z"]);
    expect(ids(box.past)).toEqual(["m", "n"]);
    expect(tied).toEqual(copy);
  });

  it("falls back to createdAt for an invite with no history", () => {
    const box = inbox(
      [
        invite("declined", { id: "h", history: [] }),
        invite("declined", { id: "g", createdAt: iso(DAY), history: [] }),
      ],
      GUEST,
      at(2 * DAY),
    );
    expect(ids(box.past)).toEqual(["g", "h"]);
  });
});
