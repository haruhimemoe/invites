/**
 * @file src/terms.ts
 * @desc Checks on invite terms that a schema refine would lose on .extend(), and the
 *       field-by-field diff a counter records in history.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { InviteTerms, TermChange } from "./schema.js";

/** JSON with sorted keys and `undefined` properties dropped, for equality. */
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

/**
 * Why a set of terms doesn't hold together, or null when it does: deadline labels must be
 * unique, every reminder must name one of them, and no reminder may repeat.
 * @function checkTerms
 * @param {InviteTerms} terms - Parsed terms (extra fields from an extended schema are fine).
 * @returns {string | null} The first problem found, or null.
 */
export function checkTerms(terms: InviteTerms): string | null {
  const labels = new Set<string>();
  for (const deadline of terms.deadlines) {
    if (labels.has(deadline.label)) return `deadline "${deadline.label}" is listed twice`;
    labels.add(deadline.label);
  }
  const plan = new Set<string>();
  for (const reminder of terms.reminders) {
    const key = `${reminder.deadline}@${reminder.before}`;
    if (plan.has(key)) return `reminder "${key}" is listed twice`;
    plan.add(key);
    if (!labels.has(reminder.deadline))
      return `reminder names unknown deadline "${reminder.deadline}"`;
  }
  return null;
}

/**
 * The top-level term fields that differ, in sorted field order. A field missing on one side has
 * no `before` or `after`.
 * @function diffTerms
 * @param {InviteTerms} before - The terms on the table.
 * @param {InviteTerms} after - The proposed terms.
 * @returns {TermChange[]} One entry per changed field; empty when equal.
 */
export function diffTerms<T extends InviteTerms>(before: T, after: T): TermChange[] {
  const a = before as Record<string, unknown>;
  const b = after as Record<string, unknown>;
  const fields = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const changes: TermChange[] = [];
  for (const field of fields) {
    if (canonical(a[field]) === canonical(b[field])) continue;
    const change: TermChange = { field };
    if (a[field] !== undefined) change.before = a[field];
    if (b[field] !== undefined) change.after = b[field];
    changes.push(change);
  }
  return changes;
}
