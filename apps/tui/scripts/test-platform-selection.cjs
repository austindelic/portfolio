'use strict';
// Exercise npm's real OS/CPU filtering without executing foreign binaries.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { fork, spawnSync } = require('node:child_process');
const { targets } = require('../npm/bin/cli.cjs');
const directory = path.resolve(process.argv[2] || 'packed');
const reports = JSON.parse(fs.readFileSync(path.join(directory, 'sizes.json')));
assert.equal(reports.length, 6, 'Selection test requires all six tarballs');
const launcher = reports.find(r => r.manifest.bin);
const { version } = launcher;
const prefix = launcher.name.startsWith('@') ? launcher.name.split('/')[0] + '/' : '';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'austindelic selection '));
const registry = fork(path.join(__dirname, 'test-registry.cjs'), [directory], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
async function main() {
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Registry startup timed out')), 10000);
    timer.unref();
    registry.once('error', reject);
    registry.once('exit', code => reject(new Error(`Registry exited: ${code}`)));
    registry.on('message', message => { if (message.url) { clearTimeout(timer); resolve(message.url); } });
  });
  let previousDownloads = 0;
  for (const target of targets) {
    const [platform, arch] = target.split('-');
    const cwd = path.join(temp, target);
    fs.mkdirSync(cwd);
    fs.writeFileSync(path.join(cwd, 'package.json'), '{"name":"selection-test","private":true}');
    const result = spawnSync(process.execPath, [process.env.NPM_CLI_JS, 'install', `${launcher.name}@${version}`, '--ignore-scripts', '--no-audit', '--no-fund', '--registry', url, '--cache', path.join(cwd, 'cache'), `--os=${platform}`, `--cpu=${arch}`], { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(fs.readdirSync(path.join(cwd, 'node_modules', prefix)).filter(n => n.startsWith('austindelic-')).map(n => prefix + n), [`${prefix}austindelic-${target}`]);
    const downloads = await new Promise(resolve => {
      registry.once('message', message => resolve(message.downloaded));
      registry.send('downloads');
    });
    assert.deepEqual([...new Set(downloads.slice(previousDownloads))].sort(), [launcher.name, `${prefix}austindelic-${target}`].sort());
    previousDownloads = downloads.length;
    console.log(`PASS: ${target} installs and downloads only its native package`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  registry.kill();
  fs.rmSync(temp, { recursive: true, force: true });
});
