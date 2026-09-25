#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { constants } from "node:os";

export type Resolver = (name: string, options: { paths: string[] }) => string;
export type LaunchHost = {
  pid: number;
  on: (event: NodeJS.Signals, handler: () => void) => unknown;
  removeListener: (event: NodeJS.Signals, handler: () => void) => unknown;
  platform: string;
  arch: string;
  versions: { node: string };
  stderr: { write: (message: string) => unknown };
  exitCode?: string | number | null;
  kill: (pid: number, signal: NodeJS.Signals) => unknown;
};
export type LaunchChild = {
  once(event: "error", handler: (error: Error) => void): unknown;
  once(
    event: "exit",
    handler: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): unknown;
  kill: (signal: NodeJS.Signals) => unknown;
};
export type SpawnProcess = (
  file: string,
  argv: string[],
  options: { stdio: "inherit"; shell: false; windowsHide: false },
) => LaunchChild;
export interface LaunchOptions {
  argv?: string[];
  host?: LaunchHost;
  spawnProcess?: SpawnProcess;
  exists?: (path: string) => boolean;
  root?: string;
  resolve?: Resolver;
}

const packageName = (require("../package.json") as { name: string }).name;
const packageScope = packageName.startsWith("@")
  ? packageName.split("/")[0] + "/"
  : "";
const targets = Object.freeze([
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "win32-x64",
]);
function executable(
  platform: string,
  arch: string,
  root = path.resolve(__dirname, ".."),
  resolve: Resolver = require.resolve,
) {
  const target = `${platform}-${arch}`;
  if (!targets.includes(target)) {
    throw new Error(
      `Unsupported platform ${target}. Supported: ${targets.join(", ")}.`,
    );
  }
  const name = `${packageScope}austindelic-${target}`;
  try {
    return resolve(
      `${name}/bin/${platform === "win32" ? "austindelic.exe" : "austindelic"}`,
      { paths: [root] },
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "MODULE_NOT_FOUND"
    )
      throw error;
    throw new Error(
      `The native package ${name} is missing. Reinstall austindelic with npm install --include=optional ${packageName}. Do not omit optional dependencies; no runtime download will be attempted.`,
    );
  }
}
function launch({
  argv = process.argv.slice(2),
  host = process,
  spawnProcess = spawn,
  exists = existsSync,
  root,
  resolve,
}: LaunchOptions = {}) {
  let file;
  try {
    if (Number(host.versions.node.split(".")[0]) < 22)
      throw new Error("Node.js 22 or newer is required.");
    file = executable(host.platform, host.arch, root, resolve);
    if (!exists(file))
      throw new Error(
        `The native executable is missing for ${host.platform}-${host.arch}. Reinstall austindelic; no runtime download will be attempted.`,
      );
  } catch (error) {
    host.stderr.write(
      `austindelic: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    host.exitCode = 1;
    return;
  }
  const child = spawnProcess(file, argv, {
    stdio: "inherit",
    shell: false,
    windowsHide: false,
  });
  let timer: NodeJS.Timeout | undefined;
  const handlers = new Map<NodeJS.Signals, () => void>();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    const handler = () => {
      // Windows delivers console Ctrl-C to both processes; avoid force-killing
      // the native process before it has restored the terminal.
      if (!(host.platform === "win32" && signal === "SIGINT"))
        child.kill(signal);
      timer ??= setTimeout(() => child.kill("SIGKILL"), 3000);
      timer.unref();
    };
    handlers.set(signal, handler);
    host.on(signal, handler);
  }
  function cleanup() {
    clearTimeout(timer);
    for (const [signal, handler] of handlers)
      host.removeListener(signal, handler);
  }
  child.once("error", (error) => {
    cleanup();
    host.stderr.write(
      `austindelic: unable to start the native application: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    host.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    cleanup();
    host.exitCode = code ?? 128 + (constants.signals[signal!] ?? 1);
    if (signal && host.platform !== "win32") host.kill(host.pid, signal);
  });
  return child;
}
export { targets, executable, launch };
if (require.main === module) launch();
