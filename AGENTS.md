# AGENTS.md

`@haruhimemoe/invites`: one job. Invites as consent: the schemas, the state machine and the rules that decide when an invite may be sent, answered or turn into reminders. Storage, routes, UI, notification delivery, Discord and tournament rules (reschedule limits, admin overrides) live in the apps. Keep it that way.

## Rules

- **No runtime dependencies.** `zod` is a peer dependency, nothing else. No network, no DOM, no Node-only APIs, no clock and no randomness in `src/`: callers pass `now` and ids. `tests/api.test.ts` checks for `node:` imports, `process` and `Buffer`.
- **Consent first.** Only the user who is `awaiting` answers; only the recipient declines; only the sender cancels; reminders only for `accepted` invites, per the agreed terms and the recipient's prefs. `tests/transition.test.ts` checks every (state, action, actor, time) combination against the table in the README. Change both together.
- **Pure.** Functions never mutate their input and never throw for bad state; they return `{ ok: false, error }` or a refusal.
- **Extendable.** Schemas carry no refinements (they would be lost on `.extend()`); cross-field checks live in functions (`checkTerms`, `createInvite`). Functions stay generic over `T extends Invite`.
- **Public API is pinned** by `tests/api.test.ts`. Adding or removing an export is a semver decision: say so in `CHANGELOG.md`. Keep the README's API section in step with `src/`.
- **Test first.** A behavior change starts as a failing case in the matching test file.
- **Changelog.** A change users can see gets a line under `## [Unreleased]` in `CHANGELOG.md` ([Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)). Never rewrite a released entry. While on 0.x, a change to transitions, schemas or rule results is a minor version.
- **Releases are cut by the maintainers.** Don't bump the version, tag, push or publish unless a maintainer asks.
- Code style: Biome (2 spaces, double quotes, 100 columns). Every file starts with the `@file / @desc / @author / @created / @modified` header. Functions exported from a file in `src/` get a JSDoc block with `@function`, `@param` and `@returns`. Keep files under 250 lines (`tests/api.test.ts` checks).
- Imports inside `src/` use `.js` extensions (Node ESM).
- Docs are for their readers: `README.md` for users, `CONTRIBUTING.md` for contributors, this file for agents. No maintainer notes in any of them.

## Layout

| Path | What's there |
| --- | --- |
| `src/index.ts` | The root exports. The only entry point. |
| `src/schema.ts` | Every zod schema, `INVITE_KINDS`, `INVITE_STATES`, `HISTORY_ACTIONS`, the inferred types. |
| `src/result.ts` | `Result`, `InviteError`, `InviteErrorCode`. |
| `src/terms.ts` | `checkTerms`, `diffTerms`. |
| `src/transition.ts` | `createInvite`, `transition`, `allowedActions`, `isOpen`, `isExpired`, `effectiveState`. |
| `src/rules.ts` | `checkBlocks`, `checkCooldown`, `checkRateLimit`, `canSend`. |
| `src/remind.ts` | `canRemind`. |
| `src/inbox.ts` | `inbox`. |
| `tests/` | Vitest: `schema`, `terms`, `transition`, `rules`, `remind`, `inbox`, `api`; `fixtures.ts` holds the shared clock and builders. |
| `scripts/smoke.mjs` | Imports the built package through its exports map (`bun run test:dist`). |
| `scripts/check-consumer.mjs` | Packs the package, installs it with a given zod version in a temp project, then typechecks and runs a strict consumer (`bun run check:consumer <zod version>`). |
| `.github/workflows/` | `ci.yml` (checks, coverage, dist on Node 22.12 and 24, consumer on zod 4.0.16 and latest) and `release.yml` (publishes on a GitHub release). |

## Before calling a change done

```sh
bun run check && bun run typecheck && bun run test && bun run test:dist
```

CI also runs `bun run test:coverage` (95% floor on `src/`) and `bun run check:consumer 4.0.16`.
