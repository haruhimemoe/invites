/**
 * @file scripts/smoke.mjs
 * @desc Imports the built package through its own exports map, the way Node consumers will, and
 *       runs one invite from create to accept to reminder. Run by `bun run test:dist`.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const { createInvite, transition, canRemind, inbox, InviteSchema, INVITE_STATES } = await import(
  "@haruhimemoe/invites"
);

const now = new Date("2026-10-06T00:00:00.000Z");
const created = createInvite(
  {
    id: "smoke",
    from: 1,
    to: 2,
    kind: "staff",
    context: { app: "tourney", scope: {} },
    terms: {
      deliverables: [],
      deadlines: [{ label: "match", at: "2026-10-10T00:00:00.000Z" }],
      reminders: [{ deadline: "match", before: 60 }],
    },
    expiresAt: "2026-10-07T00:00:00.000Z",
  },
  now,
);
assert.ok(created.ok);
const accepted = transition(created.value, { type: "accept" }, 2, now);
assert.ok(accepted.ok);
assert.ok(InviteSchema.safeParse(accepted.value).success);
assert.equal(
  canRemind(accepted.value, new Date("2026-10-09T23:30:00.000Z"), { reminders: true }).ok,
  true,
);
assert.equal(inbox([accepted.value], 2, now).active.length, 1);
assert.equal(INVITE_STATES.length, 7);
assert.ok(existsSync(new URL("../dist/index.d.ts", import.meta.url)), "dist/index.d.ts missing");
console.log("smoke: ok");
