import { dirname as pathDirname, resolve as pathResolve } from "node:path";
const __dirname = pathDirname(fileURLToPath(import.meta.url));
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

function stampVersion(root: string, version: string) {
  assert.match(version, /^\d+\.\d+\.\d+$/, "Expected a stable release version");
  const manifest = path.join(root, "cli/Cargo.toml");
  const cargo = fs.readFileSync(manifest, "utf8");
  assert.equal((cargo.match(/^version\s*=\s*"[^"]+"/gm) || []).length, 1);
  fs.writeFileSync(
    manifest,
    cargo.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`),
  );
  const lockfile = path.join(root, "Cargo.lock");
  const lock = fs.readFileSync(lockfile, "utf8");
  const pattern =
    /(\[\[package\]\]\r?\nname = "austindelic"\r?\nversion = ")[^"]+("\r?\n)/g;
  assert.equal(
    [...lock.matchAll(pattern)].length,
    1,
    "Expected exactly one CLI lockfile entry",
  );
  fs.writeFileSync(lockfile, lock.replace(pattern, `$1${version}$2`));
  const npmFile = path.join(root, "npm/package.json");
  const pkg = JSON.parse(fs.readFileSync(npmFile, "utf8"));
  pkg.version = version;
  for (const name of Object.keys(pkg.optionalDependencies))
    pkg.optionalDependencies[name] = version;
  fs.writeFileSync(npmFile, JSON.stringify(pkg, null, 2) + "\n");
}
export { stampVersion };
if (
  process.argv[1] &&
  pathResolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const manifest = JSON.parse(
    fs.readFileSync(process.argv[2] || "release-plan.json", "utf8"),
  );
  stampVersion(path.resolve(__dirname, ".."), manifest.version);
}

export default { stampVersion };
