import type {
  PackageReport,
  PackageManifest,
  SizeBudgets,
} from "./release-types.ts";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { dirname as pathDirname, resolve as pathResolve } from "node:path";
const __dirname = pathDirname(fileURLToPath(import.meta.url));
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, fork } from "node:child_process";
import assert from "node:assert/strict";
import { nativePackageName } from "../npm/bin/cli.ts";
const [directory, helper] = process.argv.slice(2);
assert.ok(
  directory && helper,
  "Usage: test-packed.ts PACKED_DIRECTORY PTY_HELPER",
);
const reports: PackageReport[] = JSON.parse(
  fs.readFileSync(path.join(directory, "sizes.json"), "utf8"),
);
const launcher = reports.find((p) => p.manifest.bin);
assert.ok(launcher, "Packed launcher is required");
const prefix = "@austindelic/";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "austindelic packed "));
function run(
  command: string,
  args: string[],
  options: import("node:child_process").SpawnSyncOptions = {},
) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `${command} failed (${result.signal ?? result.status})`,
  );
}
const registry = fork(
  path.join(__dirname, "test-registry.ts"),
  [path.resolve(directory)],
  {
    execArgv: ["--import", import.meta.resolve("tsx")],
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  },
);
async function main() {
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Registry startup timed out")),
      10000,
    );
    timer.unref();
    registry.once("error", reject);
    registry.once("exit", (code) =>
      reject(new Error(`Registry exited: ${code}`)),
    );
    registry.on("message", (message) => {
      if (
        typeof message === "object" &&
        message !== null &&
        "url" in message &&
        typeof message.url === "string"
      ) {
        clearTimeout(timer);
        resolve(message.url);
      }
    });
  });
  try {
    // npm's CLI is invoked through Node, avoiding Windows .cmd shell quoting.
    const npm = process.env.NPM_CLI_JS;
    assert.ok(
      npm && fs.existsSync(npm),
      "Set NPM_CLI_JS to npm/bin/npm-cli.js",
    );
    fs.writeFileSync(
      path.join(temp, "package.json"),
      '{"name":"packed-test","private":true}',
    );
    run(
      process.execPath,
      [
        npm,
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        `${launcher!.name}@${launcher!.version}`,
        "--registry",
        url,
        "--cache",
        path.join(temp, "cache"),
      ],
      { cwd: temp },
    );
    const reported = spawnSync(
      process.execPath,
      [
        path.join(temp, "node_modules", launcher!.name, "bin/cli.cjs"),
        "--version",
      ],
      { encoding: "utf8" },
    );
    assert.equal(reported.status, 0);
    assert.equal(
      reported.stdout.trim(),
      `austindelic ${launcher!.version}`,
      "Binary and package versions must match",
    );
    // npm exec is npx's implementation. Verify the actual locally installed package.
    run(
      process.execPath,
      [npm, "exec", "--offline", "--", "austindelic", "--version"],
      { cwd: temp },
    );
    run(
      process.execPath,
      [npm, "exec", "--offline", "--", "austindelic", "--help"],
      { cwd: temp },
    );
    const root = path.join(temp, "node_modules", launcher!.name);
    const installed = fs
      .readdirSync(path.join(temp, "node_modules", prefix))
      .filter((name) => name.startsWith("austindelic-"))
      .map((name) => prefix + name);
    assert.deepEqual(installed, [
      nativePackageName(`${process.platform}-${process.arch}`),
    ]);
    const { executable } = require(path.join(root, "bin", "cli.cjs"));
    const entries: [string, string[]][] = [
      ["native", [executable(process.platform, process.arch, root)]],
      ["launcher", [process.execPath, path.join(root, "bin", "cli.cjs")]],
      [
        "npm",
        [process.execPath, npm, "exec", "--offline", "--", "austindelic"],
      ],
    ];
    for (const [name, args] of entries) {
      console.log(`Testing terminal entry point: ${name}`);
      run(path.resolve(helper), args, { cwd: temp });
    }
    const downloads = await new Promise<string[]>((resolve) => {
      registry.on("message", (message) => {
        if (
          typeof message === "object" &&
          message !== null &&
          "downloaded" in message &&
          Array.isArray(message.downloaded) &&
          message.downloaded.every((item: unknown) => typeof item === "string")
        )
          resolve(message.downloaded);
      });
      registry.send("downloads");
    });
    assert.deepEqual(
      [...new Set(downloads)].sort(),
      [launcher!.name, ...installed].sort(),
      "Only host tarball should be downloaded",
    );
    // Verify an actual omitted optional dependency fails without a download attempt.
    fs.rmSync(path.join(temp, "node_modules", installed[0]), {
      recursive: true,
    });
    const missing = spawnSync(
      process.execPath,
      [path.join(root, "bin/cli.cjs"), "--version"],
      { encoding: "utf8" },
    );
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /--include=optional/);
  } finally {
    registry.kill();
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((error) => {
  registry.kill();
  fs.rmSync(temp, { recursive: true, force: true });
  console.error(error);
  process.exitCode = 1;
});
