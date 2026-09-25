import "./build-launcher.ts";
import type {
  PackageReport,
  PackageManifest,
  SizeBudgets,
} from "./release-types.ts";
import { dirname as pathDirname, resolve as pathResolve } from "node:path";
const __dirname = pathDirname(fileURLToPath(import.meta.url));
import { fileURLToPath } from "node:url";
// Assemble reproducible, allowlisted packages; never publish from this script.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { targets, nativePackageName } from "../npm/bin/cli.ts";
const root = path.resolve(__dirname, "..");
assert.ok(
  process.env.NPM_CLI_JS && fs.existsSync(process.env.NPM_CLI_JS),
  "Set NPM_CLI_JS to npm/bin/npm-cli.js",
);
import original from "../npm/package.json";
const registry = process.env.PACK_REGISTRY || "npm";
assert.ok(registry === "npm" || registry === "github", "Unknown registry");
import { registries } from "./publish.ts";
assert.ok(registries[registry], "Unknown registry");
const { prefix, url } = registries[registry];
const pkg = {
  ...original,
  name: prefix + original.name,
  publishConfig: { access: "public", registry: url },
  optionalDependencies: original.optionalDependencies,
};
const output = path.resolve(process.argv[2] || "packed");
const selected = process.env.NPM_TARGET ? [process.env.NPM_TARGET] : targets;
assert.ok(selected.every((t) => targets.includes(t)));
const version = fs
  .readFileSync(path.join(root, "cli/Cargo.toml"), "utf8")
  .match(/^version\s*=\s*"([^"]+)"/m)![1];
assert.equal(pkg.version, version);
if (process.env.RELEASE_TAG)
  assert.equal(process.env.RELEASE_TAG, `tui-v${version}`);
assert.deepEqual(
  pkg.optionalDependencies,
  Object.fromEntries(targets.map((t) => [nativePackageName(t), version])),
);
fs.mkdirSync(output, { recursive: true });
const staging = fs.mkdtempSync(path.join(output, ".staging-"));
const reports: PackageReport[] = [];
function pack(folder: string, manifest: PackageManifest, executableBytes = 0) {
  fs.writeFileSync(
    path.join(folder, "package.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        process.env.NPM_CLI_JS!,
        "pack",
        folder,
        "--json",
        "--ignore-scripts",
        "--pack-destination",
        output,
      ],
      { encoding: "utf8" },
    ),
  )[0];
  assert.ok(
    result.files.every((f: { path: string }) =>
      /^(package.json|README.md|LICENSE|THIRD_PARTY_NOTICES.md|bin\/(cli.cjs|austindelic(?:\.exe)?))$/.test(
        f.path,
      ),
    ),
    "Unexpected package file",
  );
  reports.push({
    registry,
    manifest,
    name: manifest.name,
    version,
    filename: result.filename,
    integrity: result.integrity,
    size: result.size,
    unpackedSize: result.unpackedSize,
    executableBytes,
  });
}
try {
  for (const target of selected) {
    const [os, cpu] = target.split("-");
    const name = nativePackageName(target);
    const folder = path.join(staging, name.replace("/", "-"));
    fs.mkdirSync(path.join(folder, "bin"), { recursive: true });
    const binary = os === "win32" ? "austindelic.exe" : "austindelic";
    const source = path.resolve("release/native", target, binary);
    const data = fs.readFileSync(source);
    const magic = data.subarray(0, 4).toString("hex");
    assert.ok(
      data.length > 1024 &&
        (os === "linux"
          ? magic === "7f454c46"
          : os === "win32"
            ? magic.startsWith("4d5a")
            : ["cffaedfe", "feedfacf", "cafebabe"].includes(magic)),
      `Invalid binary for ${target}`,
    );
    fs.copyFileSync(source, path.join(folder, "bin", binary));
    fs.chmodSync(path.join(folder, "bin", binary), 0o755);
    for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
      fs.copyFileSync(path.join(root, "npm", file), path.join(folder, file));
    fs.writeFileSync(
      path.join(folder, "README.md"),
      `# ${name}\n\nNative ${target} executable for austindelic. Install with \`npm install austindelic\`.\n`,
    );
    pack(
      folder,
      {
        name,
        version,
        description: pkg.description,
        license: pkg.license,
        repository: pkg.repository,
        os: [os],
        cpu: [cpu],
        files: ["bin/", "LICENSE", "THIRD_PARTY_NOTICES.md", "README.md"],
        publishConfig: pkg.publishConfig,
      },
      data.length,
    );
  }
  const launcher = path.join(staging, "austindelic");
  fs.mkdirSync(path.join(launcher, "bin"), { recursive: true });
  for (const file of ["bin/cli.cjs", "README.md", "LICENSE"])
    fs.copyFileSync(path.join(root, "npm", file), path.join(launcher, file));
  fs.chmodSync(path.join(launcher, "bin/cli.cjs"), 0o755);
  pack(launcher, pkg);
  // Recreate the former all-platform layout for an actual npm tarball comparison.
  if (selected.length === targets.length) {
    const legacy = path.join(staging, "baseline");
    fs.mkdirSync(legacy);
    fs.cpSync(path.resolve("release/baseline"), path.join(legacy, "native"), {
      recursive: true,
    });
    for (const file of ["README.md", "LICENSE", "THIRD_PARTY_NOTICES.md"])
      fs.copyFileSync(path.join(root, "npm", file), path.join(legacy, file));
    fs.copyFileSync(
      path.resolve("release/baseline-notices.md"),
      path.join(legacy, "THIRD_PARTY_NOTICES.md"),
    );
    fs.mkdirSync(path.join(legacy, "bin"));
    fs.copyFileSync(
      path.join(root, "npm/bin/cli.cjs"),
      path.join(legacy, "bin/cli.cjs"),
    );
    const { optionalDependencies, ...legacyManifest } = pkg;
    legacyManifest.files = [
      "bin/",
      "native/",
      "README.md",
      "LICENSE",
      "THIRD_PARTY_NOTICES.md",
    ];
    fs.writeFileSync(
      path.join(legacy, "package.json"),
      JSON.stringify(legacyManifest),
    );
    const baseline = JSON.parse(
      execFileSync(
        process.execPath,
        [
          process.env.NPM_CLI_JS!,
          "pack",
          legacy,
          "--json",
          "--ignore-scripts",
          "--pack-destination",
          staging,
        ],
        { encoding: "utf8" },
      ),
    )[0];
    fs.writeFileSync(
      path.join(output, "baseline-package.json"),
      JSON.stringify(
        { size: baseline.size, unpackedSize: baseline.unpackedSize },
        null,
        2,
      ) + "\n",
    );
  }
  fs.writeFileSync(
    path.join(output, "sizes.json"),
    JSON.stringify(reports, null, 2) + "\n",
  );
  console.log(JSON.stringify(reports, null, 2));
} finally {
  fs.rmSync(staging, { recursive: true, force: true });
}
