import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const releases = JSON.parse(readFileSync(path.join(root, "releases.json"), "utf8"));
const entries = Object.entries(releases.versions);
for (const [version, commit] of entries) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || typeof commit !== "string" || !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error(`Invalid release entry: ${version}`);
  }
}
const gitEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_")));
const git = args => execFileSync("git", args, { cwd: root, env: gitEnv });
const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: "inherit" });
const vite = directory => path.join(directory, "node_modules/vite/bin/vite.js");

run(process.execPath, [vite(root), "build"], root);
const temporary = mkdtempSync(path.join(tmpdir(), "note-versions-"));
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
    const pkg = JSON.parse(readFileSync(path.join(source, "package.json"), "utf8"));
    if (pkg.version !== version) throw new Error(`Package version does not match v${version}`);
    run("npm", ["ci", "--no-audit", "--no-fund"], source);
    run(process.execPath, [vite(source), "build", "--base", `/v${version}/`], source);
    cpSync(path.join(source, "dist"), path.join(root, "dist", `v${version}`), { recursive: true });
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
