/**
 * @file tests/schema.test.ts
 * @desc Schemas parse real invites, reject bad ones, fill defaults, and .extend() per kind.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BlockSchema,
  createInvite,
  HISTORY_ACTIONS,
  INVITE_KINDS,
  INVITE_STATES,
  InviteDraftSchema,
  InviteSchema,
  InviteTermsSchema,
  ReminderPrefsSchema,
  transition,
} from "../src/index.js";
import { draft, GUEST, invite, iso, T0 } from "./fixtures.js";

describe("schemas", () => {
  it("parses a created and transitioned invite", () => {
    const r = createInvite(draft(), T0);
    if (!r.ok) throw new Error(r.error.message);
    expect(InviteSchema.parse(r.value)).toEqual(r.value);
    const c = transition(
      r.value,
      { type: "counter", terms: { ...r.value.terms, payment: "20 USD" }, expiresAt: iso(5) },
      GUEST,
      T0,
    );
    expect(c.ok && InviteSchema.safeParse(c.value).success).toBe(true);
  });

  it("fills term and pref defaults", () => {
    expect(InviteTermsSchema.parse({})).toEqual({ deliverables: [], deadlines: [], reminders: [] });
    expect(ReminderPrefsSchema.parse({ reminders: true })).toEqual({
      reminders: true,
      mutedApps: [],
      mutedKinds: [],
      mutedInvites: [],
    });
  });

  it.each([
    ["user id 0", { ...invite(), from: 0 }],
    ["float user id", { ...invite(), to: 1.5 }],
    ["unknown state", { ...invite(), state: "maybe" }],
    ["offset time", { ...invite(), expiresAt: "2026-10-06T12:00:00+02:00" }],
    ["empty kind", { ...invite(), kind: " " }],
    [
      "zero reminder",
      { ...invite(), terms: { ...invite().terms, reminders: [{ deadline: "x", before: 0 }] } },
    ],
    ["system as awaiting", { ...invite(), awaiting: "system" }],
  ])("rejects %s", (_name, value) => {
    expect(InviteSchema.safeParse(value).success).toBe(false);
  });

  it("extends per kind", () => {
    const MapTerms = InviteTermsSchema.extend({ slot: z.string() });
    const MapInvite = InviteSchema.extend({ terms: MapTerms });
    const MapDraft = InviteDraftSchema.extend({ terms: MapTerms });
    const d = MapDraft.parse({ ...draft(), terms: { ...draft().terms, slot: "NM5" } });
    const r = createInvite(d, T0);
    if (!r.ok) throw new Error(r.error.message);
    expect(MapInvite.parse(r.value).terms.slot).toBe("NM5");
    expect(MapInvite.safeParse(invite()).success).toBe(false);
  });

  it("lists kinds, states and actions, frozen", () => {
    expect(INVITE_KINDS).toContain("reschedule");
    expect(INVITE_STATES).toHaveLength(7);
    expect(HISTORY_ACTIONS[0]).toBe("create");
    for (const list of [INVITE_KINDS, INVITE_STATES, HISTORY_ACTIONS])
      expect(Object.isFrozen(list)).toBe(true);
  });

  it("parses both block shapes", () => {
    expect(BlockSchema.safeParse({ by: 1, user: 2 }).success).toBe(true);
    expect(
      BlockSchema.safeParse({ by: 1, app: "tourney", scope: { lineage: "egc" } }).success,
    ).toBe(true);
    expect(BlockSchema.safeParse({ by: 1 }).success).toBe(false);
  });
});
