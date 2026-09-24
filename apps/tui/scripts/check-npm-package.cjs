'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../npm');
const pkg = require(path.join(root, 'package.json'));
const { targets, executable } = require(path.join(root, 'bin/cli.cjs'));
const cargo = fs.readFileSync(path.resolve(__dirname, '../cli/Cargo.toml'), 'utf8');
const version = cargo.match(/^version\s*=\s*"([^"]+)"/m)[1];
assert.equal(pkg.version, version, 'Cargo and npm versions must match');
if (process.env.RELEASE_TAG) assert.equal(process.env.RELEASE_TAG, `tui-v${version}`, 'Tag must match package version');
for (const target of targets) {
  const [platform, arch] = target.split('-');
  const file = executable(platform, arch, root);
  const data = fs.readFileSync(file);
  assert.ok(data.length > 1024, `Missing or empty executable: ${target}`);
  const magic = data.subarray(0, 4).toString('hex');
  assert.ok(platform === 'linux' ? magic === '7f454c46' : platform === 'win32' ? magic.startsWith('4d5a') : ['cffaedfe', 'feedfacf', 'cafebabe'].includes(magic), `Wrong executable format: ${target}`);
  if (platform !== 'win32') assert.ok(fs.statSync(file).mode & 0o111, `Executable mode missing: ${target}`);
}
console.log(`Validated austindelic@${version}: ${targets.join(', ')}`);
