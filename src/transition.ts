/**
 * @file src/transition.ts
 * @desc The invite state machine: createInvite, transition, allowedActions and the expiry
 *       helpers. Pure: inputs are never mutated and `now` is always passed in.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Mon Oct 12, 2026
 */

import { z } from "zod";
import { fail, type InviteError, ok, type Result } from "./result.js";
import type {
  Actor,
  HistoryEntry,
  Invite,
  InviteDraft,
  InviteState,
  InviteTerms,
} from "./schema.js";
import { checkTerms, diffTerms } from "./terms.js";

const isoTime = z.iso.datetime();
/** A stored or passed time is usable: a Date that parses, an ISO UTC string the schema takes. */
const badDate = (d: Date) => Number.isNaN(d.getTime());
const badIso = (s: string) => !isoTime.safeParse(s).success;

/** What a party can do to an invite. A counter carries the full new terms. */
export type InviteAction<T extends InviteTerms = InviteTerms> =
  | { type: "accept" | "decline" | "cancel" | "withdraw" | "expire" }
  | { type: "counter"; terms: T; expiresAt: string };

/** An action type. */
export type InviteActionType = InviteAction["type"];

const OPEN: readonly InviteState[] = ["pending", "countered"];
const ACTION_TYPES = ["accept", "decline", "counter", "cancel", "withdraw", "expire"] as const;

/** Who may run each action, and from which states. */
const RULES: Record<InviteActionType, { from: readonly InviteState[]; who: string }> = {
  accept: { from: OPEN, who: "awaiting" },
  decline: { from: OPEN, who: "recipient" },
  counter: { from: OPEN, who: "awaiting" },
  cancel: { from: OPEN, who: "sender-or-system" },
  withdraw: { from: ["accepted"], who: "party" },
  expire: { from: OPEN, who: "party-or-system" },
};

const NEXT: Record<InviteActionType, InviteState> = {
  accept: "accepted",
  decline: "declined",
  counter: "countered",
  cancel: "cancelled",
  withdraw: "withdrawn",
  expire: "expired",
};

const mayAct = (invite: Invite, who: string, actor: Actor): boolean => {
  if (actor === "system") return who === "party-or-system" || who === "sender-or-system";
  if (who === "awaiting") return actor === invite.awaiting;
  if (who === "recipient") return actor === invite.awaiting && actor === invite.to;
  if (who === "sender" || who === "sender-or-system") return actor === invite.from;
  return actor === invite.from || actor === invite.to;
};

/**
 * Whether an invite still waits for an answer (`pending` or `countered`).
 * @function isOpen
 * @param {Invite} invite - The invite.
 * @returns {boolean} True when open.
 */
export function isOpen(invite: Invite): boolean {
  return OPEN.includes(invite.state);
}

/**
 * Whether an open invite is past its answer deadline. Expired at `expiresAt` exactly. An
 * unparseable `expiresAt` counts as expired, so a bad row never stays answerable.
 * Accepted and closed invites never count as expired.
 * @function isExpired
 * @param {Invite} invite - The invite.
 * @param {Date} now - The current time.
 * @returns {boolean} True when open and `now >= expiresAt`.
 */
export function isExpired(invite: Invite, now: Date): boolean {
  const end = Date.parse(invite.expiresAt);
  return isOpen(invite) && (Number.isNaN(end) || now.getTime() >= end);
}

/**
 * The state to show: `expired` for an open invite past its deadline, else the stored state.
 * @function effectiveState
 * @param {Invite} invite - The invite.
 * @param {Date} now - The current time.
 * @returns {InviteState} The state as of `now`.
 */
export function effectiveState(invite: Invite, now: Date): InviteState {
  return isExpired(invite, now) ? "expired" : invite.state;
}

/** State, actor and expiry checks shared by transition and allowedActions. */
const gate = (
  invite: Invite,
  type: InviteActionType,
  actor: Actor,
  now: Date,
): InviteError | null => {
  const rule = RULES[type];
  if (!rule.from.includes(invite.state)) {
    return { code: "bad-state", message: `can't ${type} a ${invite.state} invite` };
  }
  if (!mayAct(invite, rule.who, actor)) {
    return { code: "bad-actor", message: `${String(actor)} can't ${type} this invite` };
  }
  if (type === "expire") {
    return isExpired(invite, now)
      ? null
      : { code: "not-expired", message: `invite is open until ${invite.expiresAt}` };
  }
  if (type !== "cancel" && isExpired(invite, now)) {
    return { code: "expired", message: `invite expired at ${invite.expiresAt}` };
  }
  return null;
};

/**
 * The actions `actor` may take on `invite` at `now`. A counter still needs new terms.
 * @function allowedActions
 * @param {Invite} invite - The invite.
 * @param {Actor} actor - An osu! user id or "system".
 * @param {Date} now - The current time.
 * @returns {InviteActionType[]} Allowed action types, in a fixed order.
 */
export function allowedActions(invite: Invite, actor: Actor, now: Date): InviteActionType[] {
  return ACTION_TYPES.filter((type) => gate(invite, type, actor, now) === null);
}

/**
 * Starts an invite: `pending`, awaiting the recipient, with a `create` history entry.
 * @function createInvite
 * @param {InviteDraft} draft - Parsed draft. Extra fields from an extended schema are kept.
 * @param {Date} now - The current time; becomes `createdAt`.
 * @returns {Result<Invite>} The invite, or `bad-input` (self invite, expiry not after now, bad terms).
 */
export function createInvite<D extends InviteDraft>(
  draft: D,
  now: Date,
): Result<D & Omit<Invite, keyof InviteDraft>> {
  if (badDate(now)) return fail("bad-input", "now is not a valid date");
  if (draft.from === draft.to) return fail("bad-input", "can't invite yourself");
  if (badIso(draft.expiresAt)) return fail("bad-input", "expiresAt is not an ISO UTC time");
  if (!(Date.parse(draft.expiresAt) > now.getTime())) {
    return fail("bad-input", "expiresAt must be after now");
  }
  const problem = checkTerms(draft.terms);
  if (problem) return fail("bad-input", problem);
  const at = now.toISOString();
  const entry: HistoryEntry = {
    at,
    by: draft.from,
    action: "create",
    fromState: null,
    toState: "pending",
  };
  return ok({
    ...draft,
    state: "pending",
    awaiting: draft.to,
    createdAt: at,
    history: [entry],
  });
}

/**
 * Applies one action. Checks run in order: state, actor, expiry (cancel skips it), then input
 * (`now` not before the last history entry, counter terms, counter `expiresAt` after now).
 * @function transition
 * @param {Invite} invite - The current invite; never mutated.
 * @param {InviteAction} action - What to do.
 * @param {Actor} actor - Who does it: an osu! user id or "system" (which may only cancel or expire).
 * @param {Date} now - The current time.
 * @returns {Result<Invite>} The new invite, or a typed error.
 */
export function transition<T extends Invite>(
  invite: T,
  action: InviteAction<T["terms"]>,
  actor: Actor,
  now: Date,
): Result<T> {
  if (badDate(now)) return fail("bad-input", "now is not a valid date");
  const refused = gate(invite, action.type, actor, now);
  if (refused) return { ok: false, error: refused };
  const last = invite.history.at(-1);
  if (last && now.getTime() < Date.parse(last.at)) {
    return fail("bad-input", "now is before the invite's last change");
  }
  const at = now.toISOString();
  const to = NEXT[action.type];
  const entry: HistoryEntry = {
    at,
    by: actor,
    action: action.type,
    fromState: invite.state,
    toState: to,
  };
  const next: T = { ...invite, state: to, awaiting: null };
  if (action.type === "counter") {
    const problem = checkTerms(action.terms);
    if (problem) return fail("bad-input", problem);
    const changes = diffTerms(invite.terms, action.terms);
    if (changes.length === 0) return fail("no-change", "counter has the same terms");
    if (badIso(action.expiresAt) || !(Date.parse(action.expiresAt) > now.getTime())) {
      return fail("bad-input", "expiresAt must be after now");
    }
    entry.changes = changes;
    next.terms = action.terms;
    next.expiresAt = action.expiresAt;
    next.awaiting = actor === invite.from ? invite.to : invite.from;
  }
  next.history = [...invite.history, entry];
  return ok(next);
}
