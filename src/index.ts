/**
 * @file src/index.ts
 * @desc @haruhimemoe/invites: schemas, the state machine, send rules, reminder gating and the
 *       inbox.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

export { type Inbox, inbox } from "./inbox.js";
export { canRemind, type DueReminder, type RemindCheck, type RemindPrefs } from "./remind.js";
export type { InviteError, InviteErrorCode, Result } from "./result.js";
export {
  type Check,
  canSend,
  checkBlocks,
  checkCooldown,
  checkRateLimit,
  type SendTarget,
} from "./rules.js";
export * from "./schema.js";
export { checkTerms, diffTerms } from "./terms.js";
export {
  allowedActions,
  createInvite,
  effectiveState,
  type InviteAction,
  type InviteActionType,
  isExpired,
  isOpen,
  transition,
} from "./transition.js";
