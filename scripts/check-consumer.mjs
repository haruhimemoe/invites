/**
 * @file scripts/check-consumer.mjs
 * @desc Installs the packed package with a given zod version into a throwaway project, then
 *       typechecks a consumer strictly (no skipLibCheck, so broken .d.ts can't hide as `any`) and
 *       runs it with a kind-extended schema. Proves the zod peer range's floor. Usage:
 *       node scripts/check-consumer.mjs <zod version> (after `bun run build`). Needs the registry.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const zod = process.argv[2];
if (!zod) throw new Error("usage: node scripts/check-consumer.mjs <zod version>");
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dir = mkdtempSync(path.join(tmpdir(), "invites-consumer-"));
const run = (command, args, cwd = dir) =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

try {
  const tarball = run("npm", ["pack", "--silent", "--pack-destination", dir], root).trim();
  writeFileSync(path.join(dir, "package.json"), JSON.stringify({ type: "module", private: true }));
  run("npm", [
    "install",
    "--silent",
    "--no-audit",
    "--no-fund",
    path.join(dir, tarball),
    `zod@${zod}`,
  ]);
  writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        exactOptionalPropertyTypes: true,
        noEmit: true,
        skipLibCheck: false,
        module: "nodenext",
        moduleResolution: "nodenext",
        target: "ES2023",
        lib: ["ES2023", "DOM"],
        types: [],
      },
      files: ["consumer.ts"],
    }),
  );
  writeFileSync(
    path.join(dir, "consumer.ts"),
    `import { z } from "zod";
import { createInvite, transition, InviteSchema, InviteTermsSchema, InviteDraftSchema, type Invite, type InviteErrorCode, type Result } from "@haruhimemoe/invites";

const MapTerms = InviteTermsSchema.extend({ slot: z.string() });
const MapInvite = InviteSchema.extend({ terms: MapTerms });
type MapInvite = z.infer<typeof MapInvite>;
const draft = InviteDraftSchema.extend({ terms: MapTerms }).parse({
  id: "c", from: 1, to: 2, kind: "custom-map", context: { app: "tourney", scope: {} },
  terms: { slot: "NM5" }, expiresAt: "2030-01-01T00:00:00.000Z",
});
const now = new Date("2029-01-01T00:00:00.000Z");
const created = createInvite(draft, now);
if (!created.ok) throw new Error(created.error.message);
const next: Result<MapInvite> = transition(MapInvite.parse(created.value), { type: "counter", terms: { ...draft.terms, slot: "HD2" }, expiresAt: "2030-01-01T00:00:00.000Z" }, 2, now);
if (!next.ok || next.value.terms.slot !== "HD2" || next.value.awaiting !== 1) throw new Error("counter");
const plain: Invite = next.value;
// @ts-expect-error an unknown error code must not typecheck (it would if types were any)
const bad: InviteErrorCode = "nonsense";
void [plain, bad];
console.log("consumer: ok");
`,
  );
  run(path.join(root, "node_modules", ".bin", "tsc"), ["-p", dir]);
  run(process.execPath, ["--experimental-strip-types", "--no-warnings", "consumer.ts"]);
  console.log(`zod ${zod}: ok`);
} catch (error) {
  console.error(`zod ${zod}: FAILED\n${error.stdout ?? ""}${error.stderr ?? error.message}`);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
