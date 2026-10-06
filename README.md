# @haruhimemoe/invites

Invites as consent. Any ask that leads to notifications (a custom map or song, a staff role, co-host, playtester, a team invite, a match reschedule) is an invite the recipient accepts first. Until then the sender gets one invite, not a notification channel.

This package is the data and the rules: zod schemas, a pure state machine, send rules (blocks, a resend cooldown, a rate limit), reminder gating and an inbox. You store invites, serve routes and deliver notifications. zod is the only peer dependency. ESM for Node 22.12+, Bun, Deno, browsers and bundlers.

## Install

```sh
bun add @haruhimemoe/invites zod
npm install @haruhimemoe/invites zod
deno add npm:@haruhimemoe/invites npm:zod
```

## Quick start

```ts
import { canRemind, canSend, createInvite, InviteDraftSchema, transition } from "@haruhimemoe/invites";

const now = new Date();
const draft = InviteDraftSchema.parse({
  id: crypto.randomUUID(),
  from: 2, // osu! user ids
  to: 124493,
  kind: "custom-map",
  context: { app: "tourney", scope: { lineage: "egc", edition: "egc-2026" } },
  terms: {
    role: "mapper",
    deliverables: ["NM5 custom"],
    deadlines: [{ label: "first draft", at: "2026-11-01T00:00:00.000Z" }],
    reminders: [{ deadline: "first draft", before: 1440 }], // minutes before
  },
  expiresAt: "2026-10-13T00:00:00.000Z", // answer by
});

const check = canSend(draft, now, { previous, blocks, sentInWindow, limit: 20, cooldownDays: 14 });
if (!check.ok) throw new Error(check.reason); // "blocked" | "cooldown" | "rate-limit"

const created = createInvite(draft, now);
if (!created.ok) throw new Error(created.error.message);

// Later, the recipient answers.
const accepted = transition(created.value, { type: "accept" }, 124493, new Date());
if (!accepted.ok) throw new Error(accepted.error.code); // e.g. "expired"

// A reminder job asks what may go out.
const due = canRemind(accepted.value, new Date(), recipientPrefs);
if (due.ok) for (const reminder of due.due) send(reminder.key); // skip keys already sent
```

Nothing throws. `createInvite` and `transition` return `{ ok: true, value }` or `{ ok: false, error: { code, message } }`, and never change the invite you pass in.

## States

`pending` and `countered` are open (someone must answer). `accepted` is live. `declined`, `withdrawn`, `cancelled` and `expired` are closed.

| From | Action | Who | To |
| --- | --- | --- | --- |
| pending, countered | `accept` | whoever is `awaiting` | accepted |
| pending, countered | `decline` | the recipient, when awaiting | declined |
| pending, countered | `counter` (full new terms and a new `expiresAt`) | whoever is `awaiting` | countered |
| pending, countered | `cancel` | the sender, any time | cancelled |
| accepted | `withdraw` | either side | withdrawn |
| pending, countered | `expire` | anyone, or `"system"` | expired |

`awaiting` is the user who must answer: the recipient at first, then the other side after each counter, `null` once accepted or closed. A sender answering a counter accepts, counters again or cancels. The `"system"` actor may only expire.

Checks run in this order, and the first failure is the error code:

1. `bad-state`: the action isn't allowed from this state.
2. `bad-actor`: this actor may not do it.
3. `expired` for accept, decline and counter at or after `expiresAt`. `not-expired` for expire before it.
4. `bad-input`: `now` is before the last history entry, or the counter's terms or `expiresAt` are bad. `no-change` for a counter with the same terms.

An open invite is expired from `expiresAt` exactly. Transitions don't expire it for you: they refuse with `expired` and you apply `{ type: "expire" }`. `effectiveState` and `inbox` already show it as expired. Accepted invites never expire.

Every change appends to `history`: `{ at, by, action, fromState, toState }`, and a counter adds `changes` (`{ field, before?, after? }` per changed top-level term).

## API

### Schemas

| Schema | Shape |
| --- | --- |
| `InviteSchema` | `id`, `from`, `to`, `kind`, `context`, `terms`, `state`, `awaiting`, `createdAt`, `expiresAt`, `history` |
| `InviteDraftSchema` | what `createInvite` takes: `id`, `from`, `to`, `kind`, `context`, `terms`, `expiresAt` |
| `InviteTermsSchema` | `role?`, `deliverables`, `deadlines`, `reminders`, `payment?` (a note, never money), `proposedTime?` |
| `InviteContextSchema` | `{ app, scope }`. `scope` maps names to ids: `{ lineage, edition, match }` |
| `DeadlineSchema` | `{ label, at }` |
| `ReminderSchema` | `{ deadline, before }`: a deadline label and minutes ahead of it |
| `ReminderPrefsSchema` | `{ reminders, mutedApps, mutedKinds, mutedInvites }` |
| `BlockSchema` | `{ by, user }` or `{ by, app, scope }` |
| `HistoryEntrySchema`, `TermChangeSchema`, `ActorSchema`, `OsuUserIdSchema`, `InviteKindSchema`, `InviteStateSchema`, `HistoryActionSchema` | the parts |

Times are ISO strings in UTC (`2026-10-06T12:00:00.000Z`, what `toISOString()` makes). User ids are osu! user ids. `INVITE_KINDS` lists the kinds the haruhime tools use; `kind` takes any string, so add your own. `INVITE_STATES` and `HISTORY_ACTIONS` list the rest. Every schema has a matching type (`Invite`, `InviteTerms`, ...).

The schemas have no refinements, so `.extend()` keeps everything:

```ts
const MapTerms = InviteTermsSchema.extend({ slot: z.string() });
const MapInvite = InviteSchema.extend({ terms: MapTerms });
```

The functions are generic, so an extended invite comes back with its extra fields and types.

### State machine

| Export | Does |
| --- | --- |
| `createInvite(draft, now)` | A `pending` invite awaiting the recipient. `bad-input` for a self invite, `expiresAt` not after `now`, or terms that fail `checkTerms`. |
| `transition(invite, action, actor, now)` | Applies one action. See [States](#states). |
| `allowedActions(invite, actor, now)` | The action types that would pass, for buttons. |
| `isOpen(invite)`, `isExpired(invite, now)`, `effectiveState(invite, now)` | Expiry as of `now`. |
| `checkTerms(terms)` | `null`, or why the terms don't hold together (repeated deadline label, reminder for an unknown deadline). |
| `diffTerms(before, after)` | The changed top-level fields. |

### Send rules

All pure: you pass in what they need.

| Export | Refuses with |
| --- | --- |
| `checkBlocks(target, blocks)` | `blocked` when the recipient (`by === to`) blocked the sender (`user`) or the app scope. A scope block matches when every id in it equals the invite's, so a block on `{ lineage }` covers its editions. Run it over open invites after a new block to find ones to cancel. |
| `checkCooldown(target, previous, now, { days })` | `cooldown` with `until` when the recipient declined a matching invite (same sender, recipient, kind and app) less than `days` days ago. Scope ids don't count, so a new edition doesn't reset it. |
| `checkRateLimit({ sentInWindow, limit })` | `rate-limit` once `sentInWindow >= limit`. You count over your own window. |
| `canSend(target, now, { previous, blocks, sentInWindow, limit, cooldownDays })` | The first of the three, in that order. |

### Reminders

`canRemind(invite, now, prefs)` returns `{ ok: true, due }` or `{ ok: false, reason }`:

- `not-accepted`: only accepted invites get reminders. Withdrawing ends them.
- `muted`: the recipient's prefs have `reminders: false`, or mute the app, the kind or this invite.
- `none-due`: nothing in the agreed plan is due.

A reminder is due from `before` minutes ahead of its deadline up to the deadline. Each due item has a stable `key` (`"first draft@1440"`), so send each key once. Pass the recipient's prefs.

### Inbox

`inbox(invites, userId, now)` groups the invites `userId` sent or received:

| Group | Holds | Sorted by |
| --- | --- | --- |
| `needsMyAnswer` | open, `awaiting` is the user | `expiresAt`, soonest first |
| `waitingOnThem` | open, the other side must answer | `expiresAt`, soonest first |
| `active` | accepted, with a time still ahead or no times at all | next deadline or `proposedTime`, none last |
| `past` | closed, expired, or accepted with every time passed | last change, newest first |

## License

MIT
