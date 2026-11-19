import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const root = fileURLToPath(new URL("../", import.meta.url));
const releases = JSON.parse(readFileSync(path.join(root, "releases.json"), "utf8"));
const versions = Object.keys(releases.versions);
const bases = ["/", ...versions.map(version => `/v${version}/`)];

test("release list is newest first", () => {
  assert.deepEqual(versions, [...versions].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })));
});

test("root output matches a normal Vite build of the working source", () => {
  const baseline = mkdtempSync(path.join(tmpdir(), "note-current-build-"));
  try {
    execFileSync(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"),
      "build", "--outDir", baseline, "--emptyOutDir"], { cwd: root, stdio: "pipe" });
    const html = readFileSync(path.join(dist, "index.html"), "utf8");
    assert.equal(html, readFileSync(path.join(baseline, "index.html"), "utf8"));
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      assert.deepEqual(readFileSync(path.join(dist, match[1])), readFileSync(path.join(baseline, match[1])));
    }
  } finally {
    rmSync(baseline, { recursive: true, force: true });
  }
});

test("build output contains only selected version paths", () => {
  const expected = bases.filter(base => base !== "/").map(base => base.slice(1, -1)).sort();
  const actual = readdirSync(dist, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^v\d+\.\d+\.\d+$/.test(entry.name))
    .map(entry => entry.name).sort();
  assert.deepEqual(actual, expected);
});

for (const base of bases) {
  test(`built Note at ${base} loads assets from its own path`, () => {
    const html = readFileSync(path.join(dist, base, "index.html"), "utf8");
    const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
    assert.ok(urls.some(url => url.endsWith(".js")));
    assert.ok(urls.some(url => url.endsWith(".css")));
    for (const url of urls) {
      assert.ok(url.startsWith(base), `${url} is outside ${base}`);
      assert.ok(existsSync(path.join(dist, url)), `Missing asset ${url}`);
    }
    assert.match(html, /id="editor"/);
    assert.match(html, /id="connectButton"/);
  });
}
