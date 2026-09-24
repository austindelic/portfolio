#!/usr/bin/env node
'use strict';
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { constants } = require('node:os');

const targets = Object.freeze(['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-x64']);
function executable(platform, arch, root = path.resolve(__dirname, '..')) {
  const target = `${platform}-${arch}`;
  if (!targets.includes(target)) {
    throw new Error(`Unsupported platform ${target}. Supported: ${targets.join(', ')}.`);
  }
  return path.join(root, 'native', target, platform === 'win32' ? 'austindelic.exe' : 'austindelic');
}
function launch({ argv = process.argv.slice(2), host = process, spawnProcess = spawn, exists = existsSync, root } = {}) {
  let file;
  try {
    if (Number(host.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required.');
    file = executable(host.platform, host.arch, root);
    if (!exists(file)) throw new Error(`The native executable is missing for ${host.platform}-${host.arch}. Reinstall austindelic; no runtime download will be attempted.`);
  } catch (error) {
    host.stderr.write(`austindelic: ${error.message}\n`);
    host.exitCode = 1;
    return;
  }
  const child = spawnProcess(file, argv, { stdio: 'inherit', shell: false, windowsHide: false });
  let timer;
  const handlers = new Map();
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    const handler = () => {
      // Windows delivers console Ctrl-C to both processes; avoid force-killing
      // the native process before it has restored the terminal.
      if (!(host.platform === 'win32' && signal === 'SIGINT')) child.kill(signal);
      timer ??= setTimeout(() => child.kill('SIGKILL'), 3000);
      timer.unref();
    };
    handlers.set(signal, handler);
    host.on(signal, handler);
  }
  function cleanup() {
    clearTimeout(timer);
    for (const [signal, handler] of handlers) host.removeListener(signal, handler);
  }
  child.once('error', (error) => {
    cleanup();
    host.stderr.write(`austindelic: unable to start the native application: ${error.message}\n`);
    host.exitCode = 1;
  });
  child.once('exit', (code, signal) => {
    cleanup();
    host.exitCode = code ?? (128 + (constants.signals[signal] ?? 1));
    if (signal && host.platform !== 'win32') host.kill(host.pid, signal);
  });
  return child;
}
module.exports = { targets, executable, launch };
if (require.main === module) launch();
