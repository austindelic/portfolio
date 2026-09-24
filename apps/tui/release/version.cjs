'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function stampVersion(root, version) {
  assert.match(version, /^\d+\.\d+\.\d+$/, 'Expected a stable release version');
  const manifest = path.join(root, 'cli/Cargo.toml');
  const cargo = fs.readFileSync(manifest, 'utf8');
  assert.equal((cargo.match(/^version\s*=\s*"[^"]+"/gm) || []).length, 1);
  fs.writeFileSync(manifest, cargo.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`));
  const lockfile = path.join(root, 'Cargo.lock');
  const lock = fs.readFileSync(lockfile, 'utf8');
  const pattern = /(\[\[package\]\]\r?\nname = "austindelic"\r?\nversion = ")[^"]+("\r?\n)/g;
  assert.equal([...lock.matchAll(pattern)].length, 1, 'Expected exactly one CLI lockfile entry');
  fs.writeFileSync(lockfile, lock.replace(pattern, `$1${version}$2`));
  const npmFile = path.join(root, 'npm/package.json');
  const pkg = JSON.parse(fs.readFileSync(npmFile));
  pkg.version = version;
  for (const name of Object.keys(pkg.optionalDependencies)) pkg.optionalDependencies[name] = version;
  fs.writeFileSync(npmFile, JSON.stringify(pkg, null, 2) + '\n');
}
module.exports = { stampVersion };
if (require.main === module) {
  const manifest = JSON.parse(fs.readFileSync(process.argv[2] || 'release-plan.json'));
  stampVersion(path.resolve(__dirname, '..'), manifest.version);
}
