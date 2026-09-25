import type {
  PackageReport,
  ReleaseBundle,
  SizeBudgets,
  PublishIO,
} from "../../scripts/release-types.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import publisher from "../../scripts/publish.ts";

test("both registries pack five platforms, select only host dependencies, and reject tampering", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tui packages "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = fileURLToPath(new URL("../../", import.meta.url));
  const tui = path.join(root, "apps/tui");
  fs.mkdirSync(tui, { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), '{"type":"module"}');
  fs.symlinkSync(
    path.resolve(source, "../../node_modules"),
    path.join(root, "node_modules"),
    "junction",
  );
  fs.cpSync(path.join(source, "scripts"), path.join(tui, "scripts"), {
    recursive: true,
  });
  fs.cpSync(path.join(source, "npm"), path.join(tui, "npm"), {
    recursive: true,
    filter: (p) => !p.includes("/native/"),
  });
  fs.mkdirSync(path.join(tui, "cli"));
  const pkg = JSON.parse(
    fs.readFileSync(path.join(tui, "npm/package.json"), "utf8"),
  );
  fs.writeFileSync(
    path.join(tui, "cli/Cargo.toml"),
    `[package]\nversion = "${pkg.version}"\n`,
  );
  fs.writeFileSync(
    path.join(tui, "npm/THIRD_PARTY_NOTICES.md"),
    "Test fixture license notices",
  );
  fs.mkdirSync(path.join(root, "release"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "release/baseline-notices.md"),
    "Test fixture baseline notices",
  );
  for (const target of [
    "darwin-arm64",
    "darwin-x64",
    "linux-arm64",
    "linux-x64",
    "win32-x64",
  ]) {
    const binary = target.startsWith("win32")
      ? "austindelic.exe"
      : "austindelic";
    const data = Buffer.alloc(2048);
    Buffer.from(
      target.startsWith("win32")
        ? "4d5a0000"
        : target.startsWith("linux")
          ? "7f454c46"
          : "cffaedfe",
      "hex",
    ).copy(data);
    for (const folder of ["native", "baseline"]) {
      const destination = path.join(root, "release", folder, target);
      fs.mkdirSync(destination, { recursive: true });
      fs.writeFileSync(path.join(destination, binary), data, { mode: 0o755 });
    }
  }
  fs.mkdirSync(path.join(root, "release/measurements"));
  for (const target of [
    "darwin-arm64",
    "darwin-x64",
    "linux-arm64",
    "linux-x64",
    "win32-x64",
  ]) {
    fs.writeFileSync(
      path.join(root, "release/measurements", `${target}.json`),
      JSON.stringify({ executableBytes: 2048 }),
    );
  }
  const npm = process.env.npm_execpath;
  assert.ok(npm, "Run through npm test");
  const packages = [];
  for (const registry of ["npm", "github"]) {
    const folder = path.join(root, "packed", registry);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NPM_CLI_JS: npm,
      PACK_REGISTRY: registry,
      NPM_CONFIG_CACHE: path.join(root, "cache"),
    };
    delete env.NPM_TARGET;
    execFileSync(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        path.join(tui, "scripts/pack.ts"),
        folder,
      ],
      { cwd: root, env, stdio: "pipe" },
    );
    const reports: PackageReport[] = JSON.parse(
      fs.readFileSync(path.join(folder, "sizes.json"), "utf8"),
    );
    const prefix = registry === "github" ? "@austindelic/" : "";
    const launcher = reports.find((p) => p.manifest.bin);
    assert.ok(launcher?.manifest.optionalDependencies);
    assert.equal(launcher.name, prefix + "austindelic");
    assert.equal(Object.keys(launcher.manifest.optionalDependencies).length, 5);
    assert.ok(
      Object.keys(launcher.manifest.optionalDependencies).every((name) =>
        name.startsWith("@austindelic/austindelic-"),
      ),
    );
    // Scoped names must still resolve to the existing canonical size budgets.
    execFileSync(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        path.join(tui, "scripts/check-npm-package.ts"),
        folder,
      ],
      {
        cwd: root,
        env: { ...env, RELEASE_TAG: `tui-v${pkg.version}` },
        stdio: "pipe",
      },
    );
    // npm itself selects each target; no foreign fixture binary is executed.
    execFileSync(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        path.join(tui, "scripts/test-platform-selection.ts"),
        folder,
      ],
      { cwd: root, env, stdio: "pipe", timeout: 60000 },
    );
    packages.push(...reports);
  }
  const bundle: ReleaseBundle = {
    schema: 1,
    sha: "a".repeat(40),
    version: pkg.version,
    tag: `tui-v${pkg.version}`,
    packages,
  };
  publisher.validateBundle(path.join(root, "packed"), bundle);
  fs.appendFileSync(
    path.join(root, "packed", "npm", packages[0].filename),
    "changed",
  );
  assert.throws(
    () => publisher.validateBundle(path.join(root, "packed"), bundle),
    /changed after testing/,
  );
});
