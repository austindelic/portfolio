'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, fork } = require('node:child_process');
const assert = require('node:assert/strict');
const [directory, helper] = process.argv.slice(2);
assert.ok(directory && helper, 'Usage: test-packed.cjs PACKED_DIRECTORY PTY_HELPER');
const reports = JSON.parse(fs.readFileSync(path.join(directory, 'sizes.json')));
const launcher = reports.find(p => p.manifest.bin);
const prefix = launcher.name.startsWith('@') ? launcher.name.split('/')[0] + '/' : '';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'austindelic packed '));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} failed (${result.signal ?? result.status})`);
}
const registry = fork(path.join(__dirname, 'test-registry.cjs'), [path.resolve(directory)], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
async function main() {
const url = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Registry startup timed out')), 10000);
  timer.unref();
  registry.once('error', reject);
  registry.once('exit', code => reject(new Error(`Registry exited: ${code}`)));
  registry.on('message', message => { if (message.url) { clearTimeout(timer); resolve(message.url); } });
});
try {
  // npm's CLI is invoked through Node, avoiding Windows .cmd shell quoting.
  const npm = process.env.NPM_CLI_JS;
  assert.ok(npm && fs.existsSync(npm), 'Set NPM_CLI_JS to npm/bin/npm-cli.js');
  fs.writeFileSync(path.join(temp, 'package.json'), '{"name":"packed-test","private":true}');
  run(process.execPath, [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', `${launcher.name}@${launcher.version}`, '--registry', url, '--cache', path.join(temp, 'cache')], { cwd: temp });
  const reported = spawnSync(process.execPath, [path.join(temp, 'node_modules', launcher.name, 'bin/cli.cjs'), '--version'], { encoding: 'utf8' });
  assert.equal(reported.status, 0);
  assert.equal(reported.stdout.trim(), `austindelic ${launcher.version}`, 'Binary and package versions must match');
  // npm exec is npx's implementation. Verify the actual locally installed package.
  run(process.execPath, [npm, 'exec', '--offline', '--', 'austindelic', '--version'], { cwd: temp });
  run(process.execPath, [npm, 'exec', '--offline', '--', 'austindelic', '--help'], { cwd: temp });
  const root = path.join(temp, 'node_modules', launcher.name);
  const installed = fs.readdirSync(path.join(temp, 'node_modules', prefix)).filter(name => name.startsWith('austindelic-')).map(name => prefix + name);
  assert.deepEqual(installed, [`${prefix}austindelic-${process.platform}-${process.arch}`]);
  const { executable } = require(path.join(root, 'bin', 'cli.cjs'));
  const entries = [
    ['native', [executable(process.platform, process.arch, root)]],
    ['launcher', [process.execPath, path.join(root, 'bin', 'cli.cjs')]],
    ['npm', [process.execPath, npm, 'exec', '--offline', '--', 'austindelic']],
  ];
  for (const [name, args] of entries) {
    console.log(`Testing terminal entry point: ${name}`);
    run(path.resolve(helper), args, { cwd: temp });
  }
  const downloads = await new Promise(resolve => {
    registry.on('message', message => { if (message.downloaded) resolve(message.downloaded); });
    registry.send('downloads');
  });
  assert.deepEqual([...new Set(downloads)].sort(), [launcher.name, ...installed].sort(), 'Only host tarball should be downloaded');
  // Verify an actual omitted optional dependency fails without a download attempt.
  fs.rmSync(path.join(temp, 'node_modules', installed[0]), { recursive: true });
  const missing = spawnSync(process.execPath, [path.join(root, 'bin/cli.cjs'), '--version'], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /--include=optional/);
} finally {
  registry.kill();
  fs.rmSync(temp, { recursive: true, force: true });
}

}
main().catch(error => { registry.kill(); fs.rmSync(temp, { recursive: true, force: true }); console.error(error); process.exitCode = 1; });
