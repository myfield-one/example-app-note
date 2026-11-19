import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const root = fileURLToPath(new URL("../", import.meta.url));
const releases = JSON.parse(readFileSync(path.join(root, "releases.json"), "utf8"));
const versions = Object.keys(releases.versions);
const current = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const bases = ["/", ...versions.map(version => `/v${version}/`)];
if (process.env.NOTE_PREVIEW_CURRENT === "1" && !versions.includes(current)) bases.push(`/v${current}/`);

test("release list is newest first and latest selects a release", () => {
  assert.ok(versions.includes(releases.latest));
  assert.deepEqual(versions, [...versions].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })));
});

test("unreleased working version is included only for development previews", () => {
  assert.equal(existsSync(path.join(dist, `v${current}`, "index.html")),
    versions.includes(current) || process.env.NOTE_PREVIEW_CURRENT === "1");
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
