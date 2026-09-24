'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { executable, launch, targets } = require('../../npm/bin/cli.cjs');
function fixture(platform = 'linux') {
  const host = Object.assign(new EventEmitter(), { platform, arch: 'x64', versions: { node: '22.0.0' }, pid: 123, stderr: { write: (s) => { host.error = s; } }, kill: (...args) => { host.killed = args; } });
  const child = Object.assign(new EventEmitter(), { kill: (s) => { child.signal = s; } });
  const calls = [];
  const spawnProcess = (...args) => { calls.push(args); return child; };
  return { host, child, calls, spawnProcess, exists: () => true };
}
test('all five platform executables resolve beneath a path with spaces', () => {
  for (const target of targets) {
    const [platform, arch] = target.split('-');
    const file = executable(platform, arch, '/tmp/path with spaces');
    assert.ok(file.includes('path with spaces'));
    assert.ok(file.endsWith(platform === 'win32' ? 'austindelic.exe' : 'austindelic'));
  }
  assert.throws(() => executable('win32', 'arm64'), /Unsupported platform/);
});
test('forwards arguments without a shell and preserves nonzero exit', () => {
  const f = fixture();
  launch({ ...f, argv: ['--cell-aspect', '0.5', 'literal;$(not-a-command)'], root: '/tmp/with spaces' });
  assert.deepEqual(f.calls[0][1], ['--cell-aspect', '0.5', 'literal;$(not-a-command)']);
  assert.equal(f.calls[0][2].stdio, 'inherit');
  assert.equal(f.calls[0][2].shell, false);
  f.child.emit('exit', 7, null);
  assert.equal(f.host.exitCode, 7);
  assert.equal(f.host.listenerCount('SIGTERM'), 0);
});
test('termination reaches child and signaled exit reaches caller', () => {
  const f = fixture();
  launch(f);
  f.host.emit('SIGTERM');
  assert.equal(f.child.signal, 'SIGTERM');
  f.child.emit('exit', null, 'SIGTERM');
  assert.deepEqual(f.host.killed, [123, 'SIGTERM']);
});
test('Windows console interrupt allows native cleanup', () => {
  const f = fixture('win32');
  launch(f);
  f.host.emit('SIGINT');
  assert.equal(f.child.signal, undefined);
  f.child.emit('exit', 0, null);
  assert.equal(f.host.exitCode, 0);
});
test('missing executable, unsupported runtime and spawn failure fail clearly', () => {
  let f = fixture(); launch({ ...f, exists: () => false });
  assert.match(f.host.error, /missing/); assert.equal(f.calls.length, 0);
  f = fixture(); f.host.versions.node = '20.0.0'; launch(f);
  assert.match(f.host.error, /22 or newer/);
  f = fixture(); launch(f); f.child.emit('error', new Error('permission denied'));
  assert.equal(f.host.exitCode, 1); assert.match(f.host.error, /permission denied/);
});
