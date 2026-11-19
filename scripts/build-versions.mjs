import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const releases = JSON.parse(readFileSync(path.join(root, "releases.json"), "utf8"));
const entries = Object.entries(releases.versions);
if (!Object.hasOwn(releases.versions, releases.latest)) throw new Error("latest must select a listed release");
for (const [version, commit] of entries) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || typeof commit !== "string" || !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error(`Invalid release entry: ${version}`);
  }
}
const temporary = mkdtempSync(path.join(tmpdir(), "note-versions-"));
const site = path.join(temporary, "site");
const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));
const git = args => execFileSync("git", args, { cwd: root, env: gitEnv });
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: "inherit" });
const readPackage = directory => JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8"));

function buildRelease(directory, base) {
  const pkg = readPackage(directory);
  const script = pkg.scripts["build:app"] ? "build:app" : "build";
  run("npm", ["run", script, "--", "--base", base], directory);
}

try {
  for (const [version, commit] of entries) {
    const tag = `refs/tags/v${version}`;
    try {
      git(["rev-parse", "--verify", `${tag}^{commit}`]);
    } catch {
      git(["fetch", "--no-tags", "origin", `${tag}:${tag}`]);
    }
    if (git(["rev-parse", `${tag}^{commit}`]).toString().trim() !== commit) {
      throw new Error(`Tag v${version} does not match releases.json`);
    }
    const source = path.join(temporary, version);
    mkdirSync(source);
    execFileSync("tar", ["-x", "-C", source], { input: git(["archive", commit]) });
    if (readPackage(source).version !== version) throw new Error(`Package version does not match v${version}`);
    run("npm", ["ci", "--no-audit", "--no-fund"], source);
    if (version === releases.latest) {
      buildRelease(source, "/");
      cpSync(path.join(source, "dist"), site, { recursive: true });
    }
  }
  for (const [version] of entries) {
    const source = path.join(temporary, version);
    buildRelease(source, `/v${version}/`);
    cpSync(path.join(source, "dist"), path.join(site, `v${version}`), { recursive: true });
  }
  if (process.env.NOTE_PREVIEW_CURRENT === "1") {
    const version = readPackage(root).version;
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Preview requires a release-shaped package version");
    if (!Object.hasOwn(releases.versions, version)) {
      run("node", [path.join(root, "node_modules/vite/bin/vite.js"), "build", "--base", `/v${version}/`, "--outDir", path.join(site, `v${version}`)], root);
    }
  }
  const output = path.join(root, "dist");
  rmSync(output, { recursive: true, force: true });
  cpSync(site, output, { recursive: true });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
