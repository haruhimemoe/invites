/**
 * @file tests/fixtures.ts
 * @desc Shared test data: two users, a fixed clock and an invite builder.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { Invite, InviteDraft, InviteState } from "../src/index.js";

export const HOST = 1001;
export const GUEST = 2002;
export const STRANGER = 3003;
export const T0 = new Date("2026-10-06T12:00:00.000Z");
export const MIN = 60_000;
export const DAY = 86_400_000;
export const at = (ms: number) => new Date(T0.getTime() + ms);
export const iso = (ms: number) => at(ms).toISOString();

export const draft = (over: Partial<InviteDraft> = {}): InviteDraft => ({
  id: "inv-1",
  from: HOST,
  to: GUEST,
  kind: "custom-map",
  context: { app: "tourney", scope: { lineage: "egc", edition: "egc-2026" } },
  terms: {
    role: "mapper",
    deliverables: ["NM5 custom"],
    deadlines: [{ label: "first draft", at: iso(10 * DAY) }],
    reminders: [{ deadline: "first draft", before: 24 * 60 }],
  },
  expiresAt: iso(DAY),
  ...over,
});

/** An invite in any state, created at T0, answer deadline T0 + 1 day. */
export const invite = (state: InviteState = "pending", over: Partial<Invite> = {}): Invite => ({
  ...draft(),
  state,
  awaiting: state === "pending" ? GUEST : state === "countered" ? HOST : null,
  createdAt: iso(0),
  history: [{ at: iso(0), by: HOST, action: "create", fromState: null, toState: "pending" }],
  ...over,
});
