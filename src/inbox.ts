/**
 * @file src/inbox.ts
 * @desc inbox: one user's invites grouped into needs-my-answer, waiting-on-them, active and
 *       past, each sorted for display.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { Invite, OsuUserId } from "./schema.js";
import { effectiveState } from "./transition.js";

/** One user's invites, grouped. */
export type Inbox<T extends Invite = Invite> = {
  /** Open, the user must answer. Soonest `expiresAt` first. */
  needsMyAnswer: T[];
  /** Open, the other side must answer. Soonest `expiresAt` first. */
  waitingOnThem: T[];
  /** Accepted and not yet done. Soonest upcoming time first, invites without one last. */
  active: T[];
  /** Closed, expired, or accepted with every time passed. Latest change first. */
  past: T[];
};

const byId = (a: Invite, b: Invite) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const times = (invite: Invite) =>
  [...invite.terms.deadlines.map((d) => d.at), invite.terms.proposedTime]
    .filter((at): at is string => at !== undefined)
    .map((at) => Date.parse(at));

/**
 * Groups and sorts the invites `userId` sent or received. Others are left out. An open invite
 * past its `expiresAt` counts as past. An accepted invite with deadlines or a proposed time is
 * past once all of them have passed; one with neither stays active until withdrawn.
 * @function inbox
 * @param {Invite[]} invites - Invites to sort; not mutated.
 * @param {OsuUserId} userId - Whose inbox.
 * @param {Date} now - The current time.
 * @returns {Inbox} The four groups.
 */
export function inbox<T extends Invite>(
  invites: readonly T[],
  userId: OsuUserId,
  now: Date,
): Inbox<T> {
  const t = now.getTime();
  const box: Inbox<T> = { needsMyAnswer: [], waitingOnThem: [], active: [], past: [] };
  const next = new Map<T, number>();
  for (const invite of invites) {
    if (invite.from !== userId && invite.to !== userId) continue;
    const state = effectiveState(invite, now);
    if (state === "pending" || state === "countered") {
      (invite.awaiting === userId ? box.needsMyAnswer : box.waitingOnThem).push(invite);
    } else if (state === "accepted") {
      const all = times(invite);
      const upcoming = all.filter((at) => at > t);
      if (all.length > 0 && upcoming.length === 0) box.past.push(invite);
      else {
        next.set(invite, upcoming.length ? Math.min(...upcoming) : Number.POSITIVE_INFINITY);
        box.active.push(invite);
      }
    } else box.past.push(invite);
  }
  const byExpiry = (a: T, b: T) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt) || byId(a, b);
  // An open invite that ran out changed last at its expiresAt.
  const lastAt = (i: T) => {
    const at = Date.parse(i.history.at(-1)?.at ?? i.createdAt);
    return effectiveState(i, now) === i.state ? at : Math.max(at, Date.parse(i.expiresAt));
  };
  box.needsMyAnswer.sort(byExpiry);
  box.waitingOnThem.sort(byExpiry);
  box.active.sort((a, b) => {
    const x = next.get(a) as number;
    const y = next.get(b) as number;
    return x === y ? byId(a, b) : x < y ? -1 : 1;
  });
  box.past.sort((a, b) => lastAt(b) - lastAt(a) || byId(a, b));
  return box;
}
