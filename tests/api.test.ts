/**
 * @file tests/api.test.ts
 * @desc The public surface (an added or removed export is a visible semver question), the
 *       exports map, no runtime deps, and that src/ stays browser-safe and small.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as root from "../src/index.js";

const API = [
  "ActorSchema",
  "BlockSchema",
  "DeadlineSchema",
  "HISTORY_ACTIONS",
  "HistoryActionSchema",
  "HistoryEntrySchema",
  "INVITE_KINDS",
  "INVITE_STATES",
  "InviteContextSchema",
  "InviteDraftSchema",
  "InviteKindSchema",
  "InviteSchema",
  "InviteStateSchema",
  "InviteTermsSchema",
  "OsuUserIdSchema",
  "ReminderPrefsSchema",
  "ReminderSchema",
  "TermChangeSchema",
  "allowedActions",
  "canRemind",
  "canSend",
  "checkBlocks",
  "checkCooldown",
  "checkRateLimit",
  "checkTerms",
  "createInvite",
  "diffTerms",
  "effectiveState",
  "inbox",
  "isExpired",
  "isOpen",
  "transition",
];

describe("exports", () => {
  it("exports exactly its API", () => {
    expect(Object.keys(root).sort()).toEqual([...API].sort());
  });

  it("maps one entry point and has no runtime deps", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(Object.keys(pkg.exports)).toEqual([".", "./package.json"]);
    expect(pkg.dependencies).toBeUndefined();
    expect(Object.keys(pkg.peerDependencies)).toEqual(["zod"]);
  });
});

describe("src", () => {
  const files = readdirSync("src").map((name) => join("src", name));

  it.each(files)("%s is browser-safe, headed and under 250 lines", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/from "node:|require\(|process\.|Buffer\b/);
    expect(source.startsWith(`/**\n * @file ${file}\n`)).toBe(true);
    expect(source.split("\n").length).toBeLessThan(250);
    expect(source.includes(String.fromCharCode(0x2014))).toBe(false); // no em dashes
  });
});
