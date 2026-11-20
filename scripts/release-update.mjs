// Makes ICEBREAKER's update files for a release (docs/UPDATES.md):
//   node scripts/release-update.mjs [--notes "what's new"] [--mac] [--from <folder>] [--publish <owner/repo>]
//
// - --mac: packs the signed local macOS build (npm run app:mac) into ICEBREAKER.app.tar.gz
//   and signs it with the updater key (~/.tauri/icebreaker-updater.key, or
//   TAURI_SIGNING_PRIVATE_KEY);
// - --from: a folder with the other systems' files from CI (…-setup.exe + .sig,
//   .AppImage + .sig — the build artifacts of a release tag);
// - writes dist-update/latest.json: the version, the notes, and for each system its file's
//   address and signature — what an installed ICEBREAKER reads to update itself;
// - --publish owner/repo: adds every file to the release v<version> there (made by CI when
//   the tag was pushed; created if it isn't there). Without --from, the Windows and Linux
//   files are first taken from that release. The repository must be PUBLIC: an installed
//   ICEBREAKER reads it without an account.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const here = resolve(new URL("..", import.meta.url).pathname);
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const version = JSON.parse(readFileSync(join(here, "package.json"), "utf8")).version;
const tag = `v${version}`;
const publish = opt("--publish");
const repo = publish ?? opt("--repo") ?? "kiddoko/ICEBREAKER";
const out = join(here, "dist-update");
mkdirSync(out, { recursive: true });

const keyFile = join(homedir(), ".tauri", "icebreaker-updater.key");
const env = { ...process.env };
if (!env.TAURI_SIGNING_PRIVATE_KEY && existsSync(keyFile)) env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(keyFile, "utf8").trim();
env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= "";

/** sign a file with the updater key: returns the signature (what latest.json carries) */
function sign(file) {
  if (!env.TAURI_SIGNING_PRIVATE_KEY) throw new Error(`no updater key: ${keyFile} (or TAURI_SIGNING_PRIVATE_KEY)`);
  execFileSync("npx", ["tauri", "signer", "sign", file], { cwd: here, env, stdio: ["ignore", "ignore", "inherit"] });
  return readFileSync(`${file}.sig`, "utf8").trim();
}

const platforms = {};
const files = [];
const url = (f) => `https://github.com/${repo}/releases/download/${tag}/${basename(f)}`;

if (args.includes("--mac")) {
  const app = join(here, "src-tauri/target/release/bundle/macos/ICEBREAKER.app");
  if (!existsSync(app)) throw new Error("no macOS build: npm run app:mac:release first");
  // never publish the testing build: it carries the developer tools (factory-reset…)
  const bin = join(app, "Contents/MacOS", readdirSync(join(app, "Contents/MacOS"))[0]);
  const kind = readFileSync(bin).includes("ICEBREAKER-BUILD:dev-tools") ? "dev-tools" : readFileSync(bin).includes("ICEBREAKER-BUILD:release") ? "release" : "unknown";
  if (kind !== "release") throw new Error(`this macOS build is "${kind}", not a release build: run npm run app:mac:release (npm run app:mac is the testing build, with the developer tools)`);
  const tar = join(out, "ICEBREAKER.app.tar.gz");
  // the signed .app as it is (codesign kept): what the updater unpacks in place of the old one
  execFileSync("tar", ["-czf", tar, "-C", join(app, ".."), "ICEBREAKER.app"]);
  const sig = sign(tar);
  const arch = execFileSync("uname", ["-m"]).toString().trim() === "arm64" ? "aarch64" : "x86_64";
  platforms[`darwin-${arch}`] = { signature: sig, url: url(tar) };
  files.push(tar);
  // and the .zip people download to install it the first time
  const zip = join(out, `ICEBREAKER-${version}-macos-${arch}.zip`);
  execFileSync("ditto", ["-c", "-k", "--keepParent", app, zip]);
  files.push(zip);
}

let from = opt("--from");
// publishing without --from: what CI attached to the release (installers + their .sig)
if (!from && publish) {
  from = join(out, "ci");
  mkdirSync(from, { recursive: true });
  try {
    execFileSync("gh", ["release", "download", tag, "-R", publish, "-D", from, "--clobber", "-p", "*-setup.exe*", "-p", "*.AppImage*"], { stdio: "inherit" });
  } catch {
    console.log(`(no Windows / Linux files on ${publish} ${tag} yet — only what's here is published)`);
  }
}
if (from) {
  for (const f of readdirSync(from)) {
    const p = join(from, f);
    const kind = /-setup\.exe$/.test(f) ? "windows-x86_64" : /\.AppImage$/.test(f) ? "linux-x86_64" : null;
    if (!kind) continue;
    const sig = existsSync(`${p}.sig`) ? readFileSync(`${p}.sig`, "utf8").trim() : sign(p);
    copyFileSync(p, join(out, f));
    platforms[kind] = { signature: sig, url: url(p) };
    files.push(join(out, f));
  }
}

if (!Object.keys(platforms).length) throw new Error("nothing to publish: --mac and/or --from <folder>");
const latest = { version, notes: opt("--notes") ?? `ICEBREAKER ${version}`, pub_date: new Date().toISOString(), platforms };
writeFileSync(join(out, "latest.json"), JSON.stringify(latest, null, 2) + "\n");
console.log(`latest.json: ${version} for ${Object.keys(platforms).join(", ")} → ${out}`);

if (publish) {
  const all = [...files, join(out, "latest.json")];
  let exists = true;
  try {
    execFileSync("gh", ["release", "view", tag, "-R", publish], { stdio: "ignore" });
  } catch {
    exists = false;
  }
  if (exists) execFileSync("gh", ["release", "upload", tag, "-R", publish, "--clobber", ...all], { stdio: "inherit" });
  else execFileSync("gh", ["release", "create", tag, "-R", publish, "-t", `ICEBREAKER ${version}`, "-n", latest.notes, ...all], { stdio: "inherit" });
  console.log(`published: https://github.com/${publish}/releases/tag/${tag}`);
}
