/**
 * @file tests/remind.test.ts
 * @desc canRemind: only accepted invites, only the agreed plan, only when prefs allow, and the
 *       exact fire and deadline boundaries.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { canRemind, INVITE_STATES, transition } from "../src/index.js";
import { at, DAY, GUEST, HOST, invite, iso, MIN } from "./fixtures.js";

const ON = { reminders: true };
const FIRE = 9 * DAY; // first draft at 10 days, reminder 24h before
const accepted = invite("accepted");

describe("canRemind", () => {
  it.each(INVITE_STATES.filter((s) => s !== "accepted"))("never for a %s invite", (state) => {
    expect(canRemind(invite(state), at(FIRE), ON)).toEqual({ ok: false, reason: "not-accepted" });
  });

  it("stops once withdrawn", () => {
    const r = transition(accepted, { type: "withdraw" }, HOST, at(MIN));
    expect(r.ok && canRemind(r.value, at(FIRE), ON)).toEqual({ ok: false, reason: "not-accepted" });
  });

  it.each([
    ["reminders off", { reminders: false }],
    ["app muted", { ...ON, mutedApps: ["tourney"] }],
    ["kind muted", { ...ON, mutedKinds: ["custom-map"] }],
    ["invite muted", { ...ON, mutedInvites: ["inv-1"] }],
  ])("respects %s", (_name, prefs) => {
    expect(canRemind(accepted, at(FIRE), prefs)).toEqual({ ok: false, reason: "muted" });
  });

  it("other mutes don't apply", () => {
    const prefs = { ...ON, mutedApps: ["pools"], mutedKinds: ["staff"], mutedInvites: ["x"] };
    expect(canRemind(accepted, at(FIRE), prefs).ok).toBe(true);
  });

  it("fires from `before` minutes ahead until the deadline (exclusive)", () => {
    expect(canRemind(accepted, at(FIRE - 1), ON)).toEqual({ ok: false, reason: "none-due" });
    const due = {
      key: "first draft@1440",
      deadline: "first draft",
      at: iso(FIRE),
      deadlineAt: iso(10 * DAY),
    };
    expect(canRemind(accepted, at(FIRE), ON)).toEqual({ ok: true, due: [due] });
    expect(canRemind(accepted, at(10 * DAY - 1), ON)).toEqual({ ok: true, due: [due] });
    expect(canRemind(accepted, at(10 * DAY), ON)).toEqual({ ok: false, reason: "none-due" });
  });

  it("only runs the agreed plan, sorted by fire time", () => {
    const terms = {
      ...accepted.terms,
      deadlines: [
        { label: "a", at: iso(2 * DAY) },
        { label: "b", at: iso(3 * DAY) },
      ],
      reminders: [
        { deadline: "b", before: 3 * 24 * 60 + 60 },
        { deadline: "a", before: 2 * 24 * 60 },
        { deadline: "a", before: 60 },
      ],
    };
    const r = canRemind({ ...accepted, terms }, at(DAY), ON);
    expect(r.ok && r.due.map((d) => d.key)).toEqual(["b@4380", "a@2880"]);
    expect(canRemind({ ...accepted, terms: { ...terms, reminders: [] } }, at(DAY), ON)).toEqual({
      ok: false,
      reason: "none-due",
    });
  });

  it("skips a reminder naming a missing deadline", () => {
    const terms = { ...accepted.terms, reminders: [{ deadline: "gone", before: 0 }] };
    expect(canRemind({ ...accepted, terms }, at(FIRE), ON).ok).toBe(false);
  });

  it("works after a real accept", () => {
    const r = transition(invite(), { type: "accept" }, GUEST, at(MIN));
    expect(r.ok && canRemind(r.value, at(FIRE), ON).ok).toBe(true);
  });
});
