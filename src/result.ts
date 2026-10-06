/**
 * @file src/result.ts
 * @desc Result and error shapes. Functions here return errors as values, never throw them.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

/** Why a transition or a new invite was refused. */
export type InviteErrorCode =
  | "bad-state"
  | "bad-actor"
  | "expired"
  | "not-expired"
  | "no-change"
  | "bad-input";

/** A refused transition: a code to switch on and a message for logs. */
export type InviteError = { code: InviteErrorCode; message: string };

/** Either the new value or the reason it was refused. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: InviteError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const fail = <T>(code: InviteErrorCode, message: string): Result<T> => ({
  ok: false,
  error: { code, message },
});
