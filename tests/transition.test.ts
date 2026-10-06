/**
 * @file tests/transition.test.ts
 * @desc Every (state, action, actor, time) combination against the spec's table, counter
 *       chains, expiry at the exact boundary, createInvite, and purity.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import {
  type Actor,
  allowedActions,
  createInvite,
  effectiveState,
  INVITE_STATES,
  type Invite,
  type InviteAction,
  type InviteActionType,
  type InviteErrorCode,
  type InviteState,
  isExpired,
  isOpen,
  transition,
} from "../src/index.js";
import { at, DAY, draft, GUEST, HOST, invite, iso, MIN, STRANGER, T0 } from "./fixtures.js";

const TYPES: InviteActionType[] = ["accept", "decline", "counter", "cancel", "withdraw", "expire"];
const ACTORS: Actor[] = [HOST, GUEST, STRANGER, "system"];
const NEW_TERMS = { ...draft().terms, deliverables: ["NM5 custom", "HD2 custom"] };
const act = (type: InviteActionType, ms: number): InviteAction =>
  type === "counter" ? { type, terms: NEW_TERMS, expiresAt: iso(ms + DAY) } : { type };

/** The spec's table, written independently of src/. */
const expected = (
  inv: Invite,
  type: InviteActionType,
  actor: Actor,
  expired: boolean,
): InviteErrorCode | InviteState => {
  const open = inv.state === "pending" || inv.state === "countered";
  const from = type === "withdraw" ? inv.state === "accepted" : open;
  if (!from) return "bad-state";
  const allowed = {
    accept: actor === inv.awaiting,
    decline: actor === inv.awaiting && actor === GUEST,
    counter: actor === inv.awaiting,
    cancel: actor === HOST,
    withdraw: actor === HOST || actor === GUEST,
    expire: true,
  }[type];
  if (!allowed) return "bad-actor";
  // Only open invites expire; withdraw is the one action from a non-open state.
  if (type === "expire") return expired ? "expired" : "not-expired";
  if (expired && type !== "cancel") return "expired";
  return {
    accept: "accepted",
    decline: "declined",
    counter: "countered",
    cancel: "cancelled",
    withdraw: "withdrawn",
  }[type] as InviteState;
};

describe("transition table", () => {
  const cases: [InviteState, InviteActionType, Actor, boolean][] = [];
  for (const state of INVITE_STATES)
    for (const type of TYPES)
      for (const actor of ACTORS)
        for (const late of [false, true]) cases.push([state, type, actor, late]);

  it.each(cases)("%s + %s by %s (past expiry: %s)", (state, type, actor, late) => {
    const inv = invite(state);
    const ms = late ? DAY : DAY - 1;
    const result = transition(inv, act(type, ms), actor, at(ms));
    const want = expected(inv, type, actor, late && isOpen(inv));
    if (result.ok) {
      expect(result.value.state).toBe(want);
      const entry = result.value.history.at(-1);
      expect(entry).toMatchObject({
        at: iso(ms),
        by: actor,
        action: type,
        fromState: state,
        toState: want,
      });
      expect(result.value.history).toHaveLength(inv.history.length + 1);
    } else {
      expect(result.error.code).toBe(want);
    }
    const allowed = allowedActions(inv, actor, at(ms)).includes(type);
    expect(allowed).toBe(result.ok);
  });

  it("covers every state, action and actor", () => {
    expect(cases).toHaveLength(7 * 6 * 4 * 2);
  });
});

describe("accepted and closed invites", () => {
  it("accepted clears awaiting and never expires", () => {
    const r = transition(invite(), { type: "accept" }, GUEST, at(MIN));
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.awaiting).toBeNull();
    expect(isExpired(r.value, at(100 * DAY))).toBe(false);
    expect(transition(r.value, { type: "expire" }, "system", at(100 * DAY))).toMatchObject({
      ok: false,
      error: { code: "bad-state" },
    });
  });

  it("system can't withdraw or accept", () => {
    expect(allowedActions(invite("accepted"), "system", T0)).toEqual([]);
    expect(allowedActions(invite(), "system", T0)).toEqual([]);
    expect(allowedActions(invite(), "system", at(DAY))).toEqual(["expire"]);
  });

  it("the sender, awaiting a counter, may accept, counter or cancel but not decline", () => {
    expect(allowedActions(invite("countered"), HOST, T0)).toEqual(["accept", "counter", "cancel"]);
    expect(allowedActions(invite("pending"), GUEST, T0)).toEqual(["accept", "decline", "counter"]);
  });
});

describe("counter chains", () => {
  it("swaps awaiting each time and records changed fields", () => {
    let inv = invite();
    const steps: [Actor, number[]][] = [
      [GUEST, [5]],
      [HOST, [6]],
      [GUEST, [7]],
    ];
    for (const [i, [actor, days]] of steps.entries()) {
      const terms = {
        ...inv.terms,
        deadlines: [{ label: "first draft", at: iso((days[0] as number) * DAY) }],
      };
      const r = transition(
        inv,
        { type: "counter", terms, expiresAt: iso((i + 2) * DAY) },
        actor,
        at((i + 1) * MIN),
      );
      if (!r.ok) throw new Error(r.error.message);
      expect(r.value.state).toBe("countered");
      expect(r.value.awaiting).toBe(actor === HOST ? GUEST : HOST);
      expect(r.value.expiresAt).toBe(iso((i + 2) * DAY));
      expect(r.value.history.at(-1)?.changes).toEqual([
        { field: "deadlines", before: inv.terms.deadlines, after: terms.deadlines },
      ]);
      expect(transition(r.value, { type: "accept" }, actor, at((i + 1) * MIN))).toMatchObject({
        ok: false,
        error: { code: "bad-actor" },
      });
      inv = r.value;
    }
    expect(inv.history.map((h) => h.action)).toEqual(["create", "counter", "counter", "counter"]);
    const done = transition(inv, { type: "accept" }, HOST, at(10 * MIN));
    expect(done.ok && done.value.terms.deadlines[0]?.at).toBe(iso(7 * DAY));
  });

  it("records added and removed fields", () => {
    const { payment: _, ...rest } = { ...draft().terms, payment: "x" };
    const r = transition(
      invite("pending", { terms: { ...rest, payment: "50 USD" } }),
      { type: "counter", terms: { ...rest, proposedTime: iso(DAY) }, expiresAt: iso(DAY) },
      GUEST,
      T0,
    );
    expect(r.ok && r.value.history.at(-1)?.changes).toEqual([
      { field: "payment", before: "50 USD" },
      { field: "proposedTime", after: iso(DAY) },
    ]);
  });

  it("rejects same terms, bad terms and a stale or missing deadline", () => {
    const inv = invite();
    const same = { ...inv.terms, deliverables: [...inv.terms.deliverables] };
    const code = (action: InviteAction) => {
      const r = transition(inv, action, GUEST, T0);
      return r.ok ? null : r.error.code;
    };
    expect(code({ type: "counter", terms: same, expiresAt: iso(DAY) })).toBe("no-change");
    const bad = { ...NEW_TERMS, reminders: [{ deadline: "nope", before: 1 }] };
    expect(code({ type: "counter", terms: bad, expiresAt: iso(DAY) })).toBe("bad-input");
    expect(code({ type: "counter", terms: NEW_TERMS, expiresAt: iso(0) })).toBe("bad-input");
    expect(code({ type: "counter", terms: NEW_TERMS, expiresAt: "nonsense" })).toBe("bad-input");
  });
});

describe("expiry boundary", () => {
  it("is open 1ms before expiresAt and expired at it", () => {
    const inv = invite();
    expect(isExpired(inv, at(DAY - 1))).toBe(false);
    expect(isExpired(inv, at(DAY))).toBe(true);
    expect(effectiveState(inv, at(DAY - 1))).toBe("pending");
    expect(effectiveState(inv, at(DAY))).toBe("expired");
    expect(transition(inv, { type: "accept" }, GUEST, at(DAY - 1)).ok).toBe(true);
    expect(transition(inv, { type: "accept" }, GUEST, at(DAY))).toMatchObject({
      ok: false,
      error: { code: "expired" },
    });
    expect(transition(inv, { type: "expire" }, "system", at(DAY)).ok).toBe(true);
  });

  it("closed states stay as stored", () => {
    for (const s of ["declined", "withdrawn", "cancelled", "expired", "accepted"] as const) {
      expect(effectiveState(invite(s), at(9 * DAY))).toBe(s);
      expect(isOpen(invite(s))).toBe(false);
    }
  });

  it("rejects a clock that went back", () => {
    expect(transition(invite(), { type: "accept" }, GUEST, at(-1))).toMatchObject({
      ok: false,
      error: { code: "bad-input" },
    });
  });
});

describe("createInvite", () => {
  it("starts pending, awaiting the recipient, with a create entry", () => {
    const r = createInvite({ ...draft(), extra: "kept" }, T0);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value).toMatchObject({
      state: "pending",
      awaiting: GUEST,
      createdAt: iso(0),
      extra: "kept",
    });
    expect(r.value.history).toEqual([
      { at: iso(0), by: HOST, action: "create", fromState: null, toState: "pending" },
    ]);
  });

  it.each([
    ["self invite", draft({ to: HOST })],
    ["expiry at now", draft({ expiresAt: iso(0) })],
    ["bad expiry", draft({ expiresAt: "x" })],
    [
      "duplicate deadline",
      draft({
        terms: {
          ...draft().terms,
          deadlines: [
            { label: "a", at: iso(1) },
            { label: "a", at: iso(2) },
          ],
          reminders: [],
        },
      }),
    ],
  ])("rejects %s", (_name, d) => {
    expect(createInvite(d, T0)).toMatchObject({ ok: false, error: { code: "bad-input" } });
  });
});

describe("purity", () => {
  it("never mutates the input and keeps extended fields", () => {
    const inv = { ...invite(), extra: { n: 1 } };
    const before = structuredClone(inv);
    const r = transition(
      inv,
      { type: "counter", terms: NEW_TERMS, expiresAt: iso(DAY) },
      GUEST,
      T0,
    );
    expect(inv).toEqual(before);
    expect(r.ok && r.value.extra).toEqual({ n: 1 });
    expect(r.ok && r.value.history).not.toBe(inv.history);
  });
});
