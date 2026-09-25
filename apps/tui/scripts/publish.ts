import type {
  ReleaseBundle,
  SizeBudgets,
  SizeMetrics,
  Publishable,
  PublishIO,
} from "./release-types.ts";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { dirname as pathDirname, resolve as pathResolve } from "node:path";
const __dirname = pathDirname(fileURLToPath(import.meta.url));
import { fileURLToPath } from "node:url";
// Publish only retained, tested archives. Safe to resume after a partial release.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { targets, nativePackageName } from "../npm/bin/cli.ts";
import { BinaryLike } from "crypto";
const registries = {
  npm: { url: "https://registry.npmjs.org/", prefix: "" },
  github: { url: "https://npm.pkg.github.com/", prefix: "@austindelic/" },
};
const integrity = (bytes: NonSharedBuffer | BinaryLike) =>
  `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
function validateBudgets(
  bundle: { packages: (SizeMetrics & { name: string })[] },
  budgets: SizeBudgets,
) {
  for (const report of bundle.packages) {
    const name = report.name.replace(/^@austindelic\//, "");
    const budget = budgets[name];
    assert.ok(
      budget,
      `Accept a measured size budget for ${name} before publishing`,
    );
    for (const metric of ["size", "unpackedSize", "executableBytes"] as const) {
      assert.ok(
        Number.isFinite(budget[metric]) && budget[metric] >= 0,
        `Invalid ${name} ${metric} budget`,
      );
      assert.ok(
        Number.isFinite(report[metric]) &&
          report[metric] >= 0 &&
          report[metric] <= Math.ceil(budget[metric] * 1.05),
        `${report.name} ${metric} exceeds accepted size + 5%`,
      );
    }
  }
}
function validateRelease(
  bundle: { release?: boolean; version: unknown; sha: unknown; tag: unknown },
  nextRelease: { version: string; gitHead: string; gitTag: string },
) {
  assert.ok(bundle.release, "Verification-only artifact cannot be published");
  assert.equal(
    bundle.version,
    nextRelease.version,
    "Release version changed after compilation",
  );
  assert.equal(
    bundle.sha,
    nextRelease.gitHead,
    "Release source changed after compilation",
  );
  assert.equal(
    bundle.tag,
    nextRelease.gitTag,
    "Release tag changed after compilation",
  );
}
function validateBundle(directory: string, bundle: ReleaseBundle) {
  assert.equal(bundle.schema, 1);
  assert.match(bundle.sha, /^[a-f0-9]{40}$/);
  assert.match(bundle.version, /^\d+\.\d+\.\d+$/);
  assert.equal(bundle.tag, `tui-v${bundle.version}`);
  for (const [registry, { prefix, url }] of Object.entries(registries)) {
    const reports = bundle.packages.filter(
      (p: { registry: string }) => p.registry === registry,
    );
    assert.deepEqual(
      reports.map((r) => r.name).sort(),
      [
        prefix + "austindelic",
        ...targets.map((t) => nativePackageName(t)),
      ].sort(),
    );
    for (const report of reports) {
      assert.equal(report.version, bundle.version);
      assert.equal(report.manifest.name, report.name);
      assert.equal(report.manifest.version, bundle.version);
      assert.equal(report.manifest.publishConfig.registry, url);
      assert.equal(path.basename(report.filename), report.filename);
      assert.equal(
        integrity(
          fs.readFileSync(path.join(directory, registry, report.filename)),
        ),
        report.integrity,
        "Tarball changed after testing",
      );
    }
  }
  assert.equal(bundle.packages.length, 12);
}
async function publishReports<T extends Publishable>(
  reports: T[],
  {
    existing,
    publish,
    sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
  }: PublishIO<T>,
) {
  // Each registry's launcher follows all five native dependencies.
  const ordered = [...reports].sort(
    (a, b) => Number(Boolean(a.manifest.bin)) - Number(Boolean(b.manifest.bin)),
  );
  for (const report of ordered) {
    const before = await existing(report);
    if (before)
      assert.equal(
        before,
        report.integrity,
        "Published artifact differs; do not overwrite this version",
      );
    else await publish(report);
    let visible = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const observed = await existing(report);
      if (observed) {
        assert.equal(observed, report.integrity, "Registry artifact differs");
        visible = true;
        break;
      }
      await sleep(5000);
    }
    assert.ok(
      visible,
      `Registry has not made ${report.name}@${report.version} available`,
    );
  }
}
async function publishAll(directory: string) {
  const bundle: ReleaseBundle = JSON.parse(
    fs.readFileSync(path.join(directory, "release.json"), "utf8"),
  );
  validateBundle(directory, bundle);
  validateBudgets(bundle, require("./size-budgets.json"));
  const npm = process.env.NPM_CLI_JS;
  assert.ok(npm && fs.existsSync(npm), "Set NPM_CLI_JS");
  const run = (args: string[]) =>
    execFileSync(process.execPath, [npm, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  for (const [registry, { url }] of Object.entries(registries)) {
    await publishReports(
      bundle.packages.filter(
        (p: { registry: string }) => p.registry === registry,
      ),
      {
        existing(report) {
          try {
            return JSON.parse(
              run([
                "view",
                `${report.name}@${report.version}`,
                "dist.integrity",
                "--json",
                `--registry=${url}`,
              ]),
            );
          } catch (error) {
            if (
              !String(
                error && typeof error === "object" && "stderr" in error
                  ? error.stderr
                  : error,
              ).includes("E404")
            )
              throw error;
            return null;
          }
        },
        publish(report) {
          const args = [
            "publish",
            path.join(directory, registry, report.filename),
            "--ignore-scripts",
            "--access=public",
            `--registry=${url}`,
          ];
          if (registry === "npm") args.push("--provenance");
          run(args);
          console.log(
            `Published ${report.name}@${report.version} to ${registry}`,
          );
        },
      },
    );
  }
}
export {
  registries,
  integrity,
  validateBundle,
  validateBudgets,
  validateRelease,
  publishReports,
  publishAll,
};
if (
  process.argv[1] &&
  pathResolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  publishAll(process.argv[2] || "packed").catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

export default {
  registries,
  integrity,
  validateBundle,
  validateBudgets,
  validateRelease,
  publishReports,
  publishAll,
};
