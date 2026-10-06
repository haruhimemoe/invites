/**
 * @file src/rules.ts
 * @desc Send-time rules on caller-supplied data: blocks, the resend cooldown after a decline and
 *       the sender rate limit, plus canSend that runs all three.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { Block, Invite } from "./schema.js";

/** The parts of an invite the send rules look at. A full invite works too. */
export type SendTarget = Pick<Invite, "from" | "to" | "kind" | "context">;

/** A rule's answer. `until` is when a cooldown ends; `block` is the matching block. */
export type Check =
  | { ok: true }
  | { ok: false; reason: "blocked"; block: Block }
  | { ok: false; reason: "cooldown"; until: string }
  | { ok: false; reason: "rate-limit" };

const DAY = 86_400_000;
const PASS: Check = { ok: true };

/**
 * Whether the recipient blocked the sender, or blocked the invite's app scope. A user block
 * matches `by === to && user === from`. A scope block matches when `by === to`, the app is the
 * same, and every scope id in the block equals the invite's (a block on a lineage covers its
 * editions; an empty scope blocks the whole app). Run it over open invites after a new block to find ones to cancel.
 * @function checkBlocks
 * @param {Pick<SendTarget, "from" | "to" | "context">} target - The invite or draft.
 * @param {Block[]} blocks - The recipient's blocks (others are ignored).
 * @returns {Check} `blocked` with the first matching block, or ok.
 */
export function checkBlocks(
  target: Pick<SendTarget, "from" | "to" | "context">,
  blocks: readonly Block[],
): Check {
  for (const block of blocks) {
    if (block.by !== target.to) continue;
    const hit =
      "user" in block
        ? block.user === target.from
        : block.app === target.context.app &&
          Object.entries(block.scope).every(([key, id]) => target.context.scope[key] === id);
    if (hit) return { ok: false, reason: "blocked", block };
  }
  return PASS;
}

/**
 * Whether the recipient declined a matching invite less than `days` days ago. Matching means
 * the same sender, recipient, kind and app (scope ids don't matter, so changing one doesn't dodge
 * it). Only a decline by the recipient counts. Resending is allowed again at the exact end.
 * `days` must be a finite number >= 0.
 * @function checkCooldown
 * @param {SendTarget} target - The draft.
 * @param {Invite[]} previous - Earlier invites; non-matching ones are ignored.
 * @param {Date} now - The current time.
 * @param {{ days: number }} options - Cooldown length in days.
 * @returns {Check} `cooldown` with `until`, or ok.
 */
export function checkCooldown(
  target: SendTarget,
  previous: readonly Invite[],
  now: Date,
  options: { days: number },
): Check {
  let until = Number.NEGATIVE_INFINITY;
  for (const invite of previous) {
    if (
      invite.from !== target.from ||
      invite.to !== target.to ||
      invite.kind !== target.kind ||
      invite.context.app !== target.context.app
    ) {
      continue;
    }
    for (const entry of invite.history) {
      if (entry.action !== "decline" || entry.by !== invite.to) continue;
      until = Math.max(until, Date.parse(entry.at) + options.days * DAY);
    }
  }
  return now.getTime() < until
    ? { ok: false, reason: "cooldown", until: new Date(until).toISOString() }
    : PASS;
}

/**
 * Whether the sender is under their limit. The app counts their recent invites over whatever
 * window it uses.
 * @function checkRateLimit
 * @param {{ sentInWindow: number; limit: number }} counts - Sent so far and the cap.
 * @returns {Check} `rate-limit` once `sentInWindow >= limit`, or ok.
 */
export function checkRateLimit(counts: { sentInWindow: number; limit: number }): Check {
  return counts.sentInWindow >= counts.limit ? { ok: false, reason: "rate-limit" } : PASS;
}

/**
 * Runs every send rule in order (blocks, cooldown, rate limit) and returns the first refusal.
 * @function canSend
 * @param {SendTarget} target - The draft.
 * @param {Date} now - The current time.
 * @param {object} data - `previous`, `blocks`, `sentInWindow`, `limit`, `cooldownDays`.
 * @returns {Check} The first refusal, or ok.
 */
export function canSend(
  target: SendTarget,
  now: Date,
  data: {
    previous: readonly Invite[];
    blocks: readonly Block[];
    sentInWindow: number;
    limit: number;
    cooldownDays: number;
  },
): Check {
  const blocked = checkBlocks(target, data.blocks);
  if (!blocked.ok) return blocked;
  const cooling = checkCooldown(target, data.previous, now, { days: data.cooldownDays });
  if (!cooling.ok) return cooling;
  return checkRateLimit(data);
}
