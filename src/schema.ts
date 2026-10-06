/**
 * @file src/schema.ts
 * @desc zod schemas for invites: context, terms, deadlines, reminder plans, history, reminder
 *       prefs and blocks. Plain objects with no refines, so apps can .extend() them per kind.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { z } from "zod";

/** The invite kinds the haruhime tools use. Kinds are plain strings, so apps may add more. */
export const INVITE_KINDS = Object.freeze([
  "custom-map",
  "custom-song",
  "staff",
  "co-host",
  "playtester",
  "team",
  "reschedule",
] as const);

/** Every invite state. `pending` and `countered` are open, `accepted` is live, the rest closed. */
export const INVITE_STATES = Object.freeze([
  "pending",
  "countered",
  "accepted",
  "declined",
  "withdrawn",
  "cancelled",
  "expired",
] as const);

/** Every history action: `create` plus the transition actions. */
export const HISTORY_ACTIONS = Object.freeze([
  "create",
  "accept",
  "decline",
  "counter",
  "cancel",
  "withdraw",
  "expire",
] as const);

const iso = () => z.iso.datetime();
const label = (max: number) => z.string().trim().min(1).max(max);

export const OsuUserIdSchema = z.number().int().positive();
export const InviteKindSchema = label(64);
export const InviteStateSchema = z.enum(INVITE_STATES);
export const HistoryActionSchema = z.enum(HISTORY_ACTIONS);

export const InviteContextSchema = z.object({
  app: label(64),
  scope: z.record(z.string().min(1).max(64), z.string().min(1).max(128)),
});

export const DeadlineSchema = z.object({ label: label(100), at: iso() });

export const ReminderSchema = z.object({
  deadline: label(100),
  before: z.number().int().min(0).max(525_600),
});

export const InviteTermsSchema = z.object({
  role: label(100).optional(),
  deliverables: z.array(label(500)).max(50).default([]),
  deadlines: z.array(DeadlineSchema).max(20).default([]),
  reminders: z.array(ReminderSchema).max(50).default([]),
  payment: label(500).optional(),
  proposedTime: iso().optional(),
});

export const ActorSchema = z.union([OsuUserIdSchema, z.literal("system")]);

export const TermChangeSchema = z.object({
  field: z.string(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});

export const HistoryEntrySchema = z.object({
  at: iso(),
  by: ActorSchema,
  action: HistoryActionSchema,
  fromState: InviteStateSchema.nullable(),
  toState: InviteStateSchema,
  changes: z.array(TermChangeSchema).optional(),
});

export const InviteSchema = z.object({
  id: z.string().min(1).max(128),
  from: OsuUserIdSchema,
  to: OsuUserIdSchema,
  kind: InviteKindSchema,
  context: InviteContextSchema,
  terms: InviteTermsSchema,
  state: InviteStateSchema,
  awaiting: OsuUserIdSchema.nullable(),
  createdAt: iso(),
  expiresAt: iso(),
  history: z.array(HistoryEntrySchema),
});

export const InviteDraftSchema = InviteSchema.pick({
  id: true,
  from: true,
  to: true,
  kind: true,
  context: true,
  terms: true,
  expiresAt: true,
});

export const ReminderPrefsSchema = z.object({
  reminders: z.boolean(),
  mutedApps: z.array(z.string()).default([]),
  mutedKinds: z.array(z.string()).default([]),
  mutedInvites: z.array(z.string()).default([]),
});

export const BlockSchema = z.union([
  z.object({ by: OsuUserIdSchema, user: OsuUserIdSchema }),
  z.object({ by: OsuUserIdSchema, app: label(64), scope: InviteContextSchema.shape.scope }),
]);

export type OsuUserId = z.infer<typeof OsuUserIdSchema>;
export type InviteKind = (typeof INVITE_KINDS)[number];
export type InviteState = z.infer<typeof InviteStateSchema>;
export type HistoryAction = z.infer<typeof HistoryActionSchema>;
export type InviteContext = z.infer<typeof InviteContextSchema>;
export type Deadline = z.infer<typeof DeadlineSchema>;
export type Reminder = z.infer<typeof ReminderSchema>;
export type InviteTerms = z.infer<typeof InviteTermsSchema>;
export type Actor = z.infer<typeof ActorSchema>;
export type TermChange = z.infer<typeof TermChangeSchema>;
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export type Invite = z.infer<typeof InviteSchema>;
export type InviteDraft = z.infer<typeof InviteDraftSchema>;
export type ReminderPrefs = z.infer<typeof ReminderPrefsSchema>;
export type Block = z.infer<typeof BlockSchema>;
