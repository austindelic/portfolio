'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const [archive, helper] = process.argv.slice(2);
assert.ok(archive && helper, 'Usage: test-packed.cjs TARBALL PTY_HELPER');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'austindelic packed '));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed (${result.signal ?? result.status})`);
}
try {
  // npm's CLI is invoked through Node, avoiding Windows .cmd shell quoting.
  const npm = process.env.NPM_CLI_JS;
  assert.ok(npm && fs.existsSync(npm), 'Set NPM_CLI_JS to npm/bin/npm-cli.js');
  fs.writeFileSync(path.join(temp, 'package.json'), '{"name":"packed-test","private":true}');
  run(process.execPath, [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', path.resolve(archive)], { cwd: temp });
  // npm exec is npx's implementation. Verify the actual locally installed package.
  run(process.execPath, [npm, 'exec', '--offline', '--', 'austindelic', '--version'], { cwd: temp });
  run(path.resolve(helper), [process.execPath, npm, 'exec', '--offline', '--', 'austindelic'], { cwd: temp });
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
