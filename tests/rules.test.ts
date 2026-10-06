/**
 * @file tests/rules.test.ts
 * @desc Blocks (user, scope subset, direction), the resend cooldown at its exact end, the rate
 *       limit at its cap, and canSend's order.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import {
  type Block,
  canSend,
  checkBlocks,
  checkCooldown,
  checkRateLimit,
  transition,
} from "../src/index.js";
import { at, DAY, draft, GUEST, HOST, invite, iso, STRANGER, T0 } from "./fixtures.js";

const target = draft();

describe("checkBlocks", () => {
  it.each<[string, Block, boolean]>([
    ["recipient blocked sender", { by: GUEST, user: HOST }, true],
    ["sender blocked recipient", { by: HOST, user: GUEST }, false],
    ["someone else's block", { by: STRANGER, user: HOST }, false],
    ["other user", { by: GUEST, user: STRANGER }, false],
    ["whole app", { by: GUEST, app: "tourney", scope: {} }, true],
    ["lineage covers editions", { by: GUEST, app: "tourney", scope: { lineage: "egc" } }, true],
    [
      "exact scope",
      { by: GUEST, app: "tourney", scope: { lineage: "egc", edition: "egc-2026" } },
      true,
    ],
    ["other lineage", { by: GUEST, app: "tourney", scope: { lineage: "owc" } }, false],
    ["scope key the invite lacks", { by: GUEST, app: "tourney", scope: { match: "m1" } }, false],
    ["other app", { by: GUEST, app: "pools", scope: {} }, false],
    ["scope block by sender", { by: HOST, app: "tourney", scope: {} }, false],
  ])("%s", (_name, block, hit) => {
    expect(checkBlocks(target, [block])).toEqual(
      hit ? { ok: false, reason: "blocked", block } : { ok: true },
    );
  });

  it("returns the first match and works on a full invite", () => {
    const a: Block = { by: GUEST, user: HOST };
    const b: Block = { by: GUEST, app: "tourney", scope: {} };
    expect(checkBlocks(invite(), [a, b])).toEqual({ ok: false, reason: "blocked", block: a });
    expect(checkBlocks(target, [])).toEqual({ ok: true });
  });
});

describe("checkCooldown", () => {
  const declined = (() => {
    const r = transition(invite(), { type: "decline" }, GUEST, T0);
    if (!r.ok) throw new Error(r.error.message);
    return r.value;
  })();

  it("blocks until exactly N days after the decline", () => {
    const until = { ok: false, reason: "cooldown", until: iso(7 * DAY) };
    expect(checkCooldown(target, [declined], at(7 * DAY - 1), { days: 7 })).toEqual(until);
    expect(checkCooldown(target, [declined], at(7 * DAY), { days: 7 })).toEqual({ ok: true });
  });

  it("ignores other kinds, apps, pairs, and non-declines", () => {
    const now = at(DAY);
    const opts = { days: 7 };
    expect(checkCooldown({ ...target, kind: "staff" }, [declined], now, opts).ok).toBe(true);
    expect(
      checkCooldown({ ...target, context: { app: "pools", scope: {} } }, [declined], now, opts).ok,
    ).toBe(true);
    expect(checkCooldown({ ...target, to: STRANGER }, [declined], now, opts).ok).toBe(true);
    expect(checkCooldown(target, [invite("cancelled"), invite("expired")], now, opts).ok).toBe(
      true,
    );
  });

  it("ignores scope ids, so a new edition doesn't dodge it", () => {
    const t = { ...target, context: { app: "tourney", scope: { edition: "egc-2027" } } };
    expect(checkCooldown(t, [declined], at(DAY), { days: 7 }).ok).toBe(false);
  });

  it("uses the latest decline", () => {
    const later = {
      ...declined,
      history: declined.history.map((h) =>
        h.action === "decline" ? { ...h, at: iso(3 * DAY) } : h,
      ),
    };
    expect(checkCooldown(target, [later, declined], at(8 * DAY), { days: 7 })).toEqual({
      ok: false,
      reason: "cooldown",
      until: iso(10 * DAY),
    });
  });
});

describe("checkRateLimit", () => {
  it("allows up to the limit", () => {
    expect(checkRateLimit({ sentInWindow: 4, limit: 5 })).toEqual({ ok: true });
    expect(checkRateLimit({ sentInWindow: 5, limit: 5 })).toEqual({
      ok: false,
      reason: "rate-limit",
    });
    expect(checkRateLimit({ sentInWindow: 0, limit: 0 }).ok).toBe(false);
  });
});

describe("canSend", () => {
  const declined = invite("declined", {
    history: [
      ...invite().history,
      { at: iso(0), by: GUEST, action: "decline", fromState: "pending", toState: "declined" },
    ],
  });
  const base = { previous: [], blocks: [], sentInWindow: 0, limit: 5, cooldownDays: 7 };

  it("checks blocks, then cooldown, then rate limit", () => {
    const block: Block = { by: GUEST, user: HOST };
    const all = {
      previous: [declined],
      blocks: [block],
      sentInWindow: 9,
      limit: 5,
      cooldownDays: 7,
    };
    expect(canSend(target, T0, all)).toMatchObject({ reason: "blocked" });
    expect(canSend(target, T0, { ...all, blocks: [] })).toMatchObject({ reason: "cooldown" });
    expect(canSend(target, T0, { ...all, blocks: [], previous: [] })).toMatchObject({
      reason: "rate-limit",
    });
    expect(canSend(target, T0, base)).toEqual({ ok: true });
  });
});
