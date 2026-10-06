/**
 * @file src/remind.ts
 * @desc canRemind: which of an invite's agreed reminders are due. Reminders only run for an
 *       accepted invite, only from its terms, and only when the recipient's prefs allow them.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { Invite, ReminderPrefs } from "./schema.js";

/** One reminder to send now. `key` is stable, so the app can skip ones it already sent. */
export type DueReminder = { key: string; deadline: string; at: string; deadlineAt: string };

/** canRemind's answer. */
export type RemindCheck =
  | { ok: true; due: DueReminder[] }
  | { ok: false; reason: "not-accepted" | "muted" | "none-due" };

/** Reminder prefs as stored; the mute lists may be left out. */
export type RemindPrefs = Pick<ReminderPrefs, "reminders"> &
  Partial<Pick<ReminderPrefs, "mutedApps" | "mutedKinds" | "mutedInvites">>;

/**
 * The reminders due at `now`. A reminder is due from `before` minutes ahead of its deadline
 * until the deadline itself (exclusive). Reminders go to the recipient, so pass their prefs.
 * @function canRemind
 * @param {Invite} invite - The invite.
 * @param {Date} now - The current time.
 * @param {RemindPrefs} prefs - The recipient's prefs.
 * @returns {RemindCheck} Due reminders sorted by time, or why none may go out.
 */
export function canRemind(invite: Invite, now: Date, prefs: RemindPrefs): RemindCheck {
  if (invite.state !== "accepted") return { ok: false, reason: "not-accepted" };
  if (
    !prefs.reminders ||
    prefs.mutedApps?.includes(invite.context.app) ||
    prefs.mutedKinds?.includes(invite.kind) ||
    prefs.mutedInvites?.includes(invite.id)
  ) {
    return { ok: false, reason: "muted" };
  }
  const t = now.getTime();
  const due: DueReminder[] = [];
  for (const reminder of invite.terms.reminders) {
    const deadline = invite.terms.deadlines.find((d) => d.label === reminder.deadline);
    if (!deadline) continue;
    const end = Date.parse(deadline.at);
    const fire = end - reminder.before * 60_000;
    if (!(fire <= t && t < end)) continue;
    due.push({
      key: `${reminder.deadline}@${reminder.before}`,
      deadline: reminder.deadline,
      at: new Date(fire).toISOString(),
      deadlineAt: deadline.at,
    });
  }
  if (due.length === 0) return { ok: false, reason: "none-due" };
  due.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.key < b.key ? -1 : 1));
  return { ok: true, due };
}
