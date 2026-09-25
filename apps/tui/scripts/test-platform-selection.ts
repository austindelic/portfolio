import type {
  PackageReport,
  PackageManifest,
  SizeBudgets,
} from "./release-types.ts";
import { dirname as pathDirname, resolve as pathResolve } from "node:path";
const __dirname = pathDirname(fileURLToPath(import.meta.url));
import { fileURLToPath } from "node:url";
// Exercise npm's real OS/CPU filtering without executing foreign binaries.
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fork, spawnSync } from "node:child_process";
import { targets, nativePackageName } from "../npm/bin/cli.ts";
const directory = path.resolve(process.argv[2] || "packed");
const reports: PackageReport[] = JSON.parse(
  fs.readFileSync(path.join(directory, "sizes.json"), "utf8"),
);
assert.equal(reports.length, 6, "Selection test requires all six tarballs");
const launcher = reports.find((r) => r.manifest.bin);
assert.ok(launcher, "Packed launcher is required");
const { version } = launcher;
const prefix = "@austindelic/";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "austindelic selection "));
const registry = fork(path.join(__dirname, "test-registry.ts"), [directory], {
  execArgv: ["--import", import.meta.resolve("tsx")],
  stdio: ["ignore", "inherit", "inherit", "ipc"],
});
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
  let previousDownloads = 0;
  for (const target of targets) {
    const [platform, arch] = target.split("-");
    const cwd = path.join(temp, target);
    fs.mkdirSync(cwd);
    fs.writeFileSync(
      path.join(cwd, "package.json"),
      '{"name":"selection-test","private":true}',
    );
    const result = spawnSync(
      process.execPath,
      [
        process.env.NPM_CLI_JS!,
        "install",
        `${launcher!.name}@${version}`,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--registry",
        url,
        "--cache",
        path.join(cwd, "cache"),
        `--os=${platform}`,
        `--cpu=${arch}`,
      ],
      { cwd, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      fs
        .readdirSync(path.join(cwd, "node_modules", prefix))
        .filter((n) => n.startsWith("austindelic-"))
        .map((n) => prefix + n),
      [nativePackageName(target)],
    );
    const launcherRoot = path.join(cwd, "node_modules", launcher!.name);
    const packedLauncher = createRequire(import.meta.url)(
      path.join(launcherRoot, "bin/cli.cjs"),
    ) as typeof import("../npm/bin/cli.ts");
    assert.equal(
      packedLauncher.executable(platform, arch, launcherRoot),
      fs.realpathSync(
        path.join(
          cwd,
          "node_modules",
          nativePackageName(target),
          "bin",
          platform === "win32" ? "austindelic.exe" : "austindelic",
        ),
      ),
    );
    const downloads = await new Promise<string[]>((resolve) => {
      registry.once("message", (message) => {
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
      [...new Set(downloads.slice(previousDownloads))].sort(),
      [launcher!.name, nativePackageName(target)].sort(),
    );
    previousDownloads = downloads.length;
    console.log(
      `PASS: ${target} installs and downloads only its native package`,
    );
  }
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    registry.kill();
    fs.rmSync(temp, { recursive: true, force: true });
  });
