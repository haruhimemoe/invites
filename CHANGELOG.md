# Changelog

All notable changes to `@haruhimemoe/invites` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While on 0.x, a change to transitions, schemas or rule results is a minor version.

## [Unreleased]

## [0.1.0] - 2026-10-06

### Added

- zod schemas for invites, drafts, terms, deadlines, reminders, history, reminder prefs and blocks, all `.extend()`-able. `INVITE_KINDS`, `INVITE_STATES`, `HISTORY_ACTIONS`.
- `createInvite`, `transition`, `allowedActions`, `isOpen`, `isExpired`, `effectiveState`: the state machine over pending, countered, accepted, declined, withdrawn, cancelled and expired.
- `checkTerms`, `diffTerms`.
- `checkBlocks`, `checkCooldown`, `checkRateLimit`, `canSend`: send rules.
- `canRemind`: reminders for accepted invites per the agreed plan and the recipient's prefs.
- `inbox`: needs my answer, waiting on them, active, past.

[Unreleased]: https://github.com/haruhimemoe/invites/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/haruhimemoe/invites/releases/tag/v0.1.0
