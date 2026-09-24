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
  const root = path.join(temp, 'node_modules', 'austindelic');
  const { executable } = require(path.join(root, 'bin', 'cli.cjs'));
  const entries = [
    ['native', [executable(process.platform, process.arch, root)]],
    ['launcher', [process.execPath, path.join(root, 'bin', 'cli.cjs')]],
    ['npm', [process.execPath, npm, 'exec', '--offline', '--', 'austindelic']],
  ];
  for (const [name, args] of entries) {
    const trace = path.join(temp, `${name}-startup.log`);
    console.log(`Testing terminal entry point: ${name}`);
    try {
      run(path.resolve(helper), args, { cwd: temp, env: { ...process.env, AUSTINDELIC_STARTUP_TRACE: trace } });
    } finally {
      console.log(`${name} startup trace:\n${fs.existsSync(trace) ? fs.readFileSync(trace, 'utf8') : '(process did not reach startup trace)'}`);
    }
  }
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
