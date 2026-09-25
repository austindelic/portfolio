import type {
  PackageReport,
  ReleaseBundle,
  SizeBudgets,
  PublishIO,
} from "../../scripts/release-types.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Writable } from "node:stream";
import semanticRelease from "semantic-release";
import { relevantPath } from "../paths.ts";
import { analyzeCommits, verifyRelease } from "../plugin.ts";
import versioning from "../version.ts";
import publisher from "../../scripts/publish.ts";

const quiet = new Writable({
  write(chunk, encoding, callback) {
    callback();
  },
});
function repository(t: import("node:test").TestContext) {
  const root = mkdtempSync(path.join(os.tmpdir(), "tui release "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "-b", "main");
  git("config", "user.email", "release-test@example.invalid");
  git("config", "user.name", "Release Test");
  function commit(file: string, message: string) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), message + Date.now());
    git("add", file);
    git("commit", "-m", message);
    return { hash: git("rev-parse", "HEAD"), message };
  }
  return { root, git, commit };
}

test("only release inputs count; ordinary changes default to patch", async (t) => {
  const r = repository(t);
  const commits = [
    r.commit("apps/tui/readme.md", "Improve instructions"),
    r.commit("apps/portfolio/page.ts", "feat: unrelated website feature"),
  ];
  const context = { cwd: r.root, commits, logger: { log() {} } };
  assert.equal(await analyzeCommits({}, context), "patch");
  assert.equal(
    await analyzeCommits({}, { ...context, commits: commits.slice(1) }),
    null,
  );
  assert.equal(await analyzeCommits({}, { ...context, commits: [] }), null);
  assert.ok(relevantPath("packages/black-hole/routes.json"));
  assert.ok(relevantPath("apps/portfolio/src/content/blog/post/index.md"));
  assert.equal(relevantPath("README.md"), false);
});

test("all embedded asset inputs are covered by release analysis and workflow triggers", () => {
  const root = fileURLToPath(new URL("../../../../", import.meta.url));
  const inputs = Object.keys(
    JSON.parse(
      readFileSync(path.join(root, "apps/tui/assets-manifest.json"), "utf8"),
    ),
  );
  const workflow = readFileSync(
    path.join(root, ".github/workflows/release-tui.yml"),
    "utf8",
  );
  const paths = [...workflow.matchAll(/^      - '([^']+)'$/gm)].map(
    (match) => match[1],
  );
  for (const input of inputs) {
    assert.ok(relevantPath(input), `Commit analysis misses ${input}`);
    assert.ok(
      paths.some((p) =>
        p.endsWith("/**") ? input.startsWith(p.slice(0, -2)) : input === p,
      ),
      `Workflow misses ${input}`,
    );
  }
});

test("features and breaking changes use semantic-release commit analysis", async (t) => {
  const r = repository(t);
  const context = { cwd: r.root, logger: { log() {} } };
  const feature = r.commit("apps/tui/feature.rs", "feat: add terminal feature");
  assert.equal(
    await analyzeCommits({}, { ...context, commits: [feature] }),
    "minor",
  );
  const breaking = r.commit(
    "apps/tui/feature.rs",
    "feat: change CLI\n\nBREAKING CHANGE: remove an option",
  );
  assert.equal(
    await analyzeCommits({}, { ...context, commits: [feature, breaking] }),
    "major",
  );
});

test("real semantic-release dry runs choose 1.0.0, then patch, and skip duplicate or irrelevant changes", async (t) => {
  const r = repository(t);
  r.commit("apps/tui/cli.rs", "Initial CLI");
  // A local bare remote exercises semantic-release without publishing or network.
  const remote = path.join(r.root, "remote.git");
  // Match the pushed branch even when the runner defaults new repos to master.
  execFileSync("git", ["init", "--bare", "-b", "main", remote], {
    stdio: "pipe",
  });
  r.git("remote", "add", "origin", remote);
  r.git("push", "origin", "main");
  const options = {
    branches: ["main"],
    repositoryUrl: pathToFileURL(remote).href,
    tagFormat: "tui-v${version}",
    dryRun: true,
    plugins: [fileURLToPath(new URL("../plugin.ts", import.meta.url))],
  };
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CI: "true",
    GITHUB_ACTIONS: "",
    GITHUB_TOKEN: "",
    GH_TOKEN: "",
  };
  const run = () =>
    semanticRelease(options, {
      cwd: r.root,
      env,
      stdout: quiet as NodeJS.WriteStream,
      stderr: quiet as NodeJS.WriteStream,
    });
  const initial = await run();
  assert.ok(initial);
  assert.equal(initial.nextRelease.version, "1.0.0");
  assert.equal(r.git("tag", "--list"), "", "Dry run must not create tags");
  r.git("tag", "tui-v1.0.0");
  r.git("push", "origin", "tui-v1.0.0");
  assert.equal(await run(), false);
  r.commit("README.md", "feat: update unrelated readme");
  r.git("push", "origin", "main");
  assert.equal(await run(), false);
  r.commit("apps/tui/cli.rs", "Improve terminal output");
  r.git("push", "origin", "main");
  const patch = await run();
  assert.ok(patch);
  assert.equal(patch.nextRelease.version, "1.0.1");
});

test("version stamping keeps Cargo, lockfile, launcher and optional dependencies aligned", (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "tui version "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "cli"));
  mkdirSync(path.join(root, "npm"));
  writeFileSync(
    path.join(root, "cli/Cargo.toml"),
    '[package]\nname = "austindelic"\nversion = "0.1.0"\n',
  );
  writeFileSync(
    path.join(root, "Cargo.lock"),
    '[[package]]\nname = "austindelic"\nversion = "0.1.0"\n\n[[package]]\nname = "other"\nversion = "0.1.0"\n',
  );
  writeFileSync(
    path.join(root, "npm/package.json"),
    JSON.stringify({
      version: "0.1.0",
      optionalDependencies: { "austindelic-linux-x64": "0.1.0" },
    }),
  );
  versioning.stampVersion(root, "1.2.3");
  assert.match(
    readFileSync(path.join(root, "cli/Cargo.toml"), "utf8"),
    /version = "1.2.3"/,
  );
  assert.match(
    readFileSync(path.join(root, "Cargo.lock"), "utf8"),
    /name = "other"\nversion = "0.1.0"/,
  );
  assert.equal(
    JSON.parse(readFileSync(path.join(root, "npm/package.json"), "utf8"))
      .optionalDependencies["austindelic-linux-x64"],
    "1.2.3",
  );
  assert.throws(
    () => versioning.stampVersion(root, "1.0.0\nmalicious"),
    /stable/,
  );
});

test("publishing orders dependencies first and resumes identical archives", async () => {
  const reports = [
    { name: "launcher", integrity: "launcher-hash", manifest: { bin: {} } },
    { name: "native", integrity: "native-hash", manifest: {} },
  ];
  const stored = new Map();
  const calls: string[] = [];
  const io: PublishIO<(typeof reports)[number]> = {
    existing: (p) => stored.get(p.name),
    publish(p) {
      calls.push(p.name);
      stored.set(p.name, p.integrity);
    },
  };
  await publisher.publishReports(reports, io);
  assert.deepEqual(calls, ["native", "launcher"]);
  await publisher.publishReports(reports, io);
  assert.equal(calls.length, 2);
  stored.delete("launcher");
  await publisher.publishReports(reports, io);
  assert.deepEqual(calls, ["native", "launcher", "launcher"]);
  stored.set("native", "different");
  await assert.rejects(publisher.publishReports(reports, io), /differs/);
});

test("unavailable native packages stop launcher publication", async () => {
  const calls: string[] = [];
  await assert.rejects(
    publisher.publishReports(
      [
        { name: "launcher", manifest: { bin: {} } },
        { name: "native", manifest: {} },
      ],
      {
        existing() {
          return null;
        },
        publish(p) {
          calls.push(p.name);
        },
        sleep() {},
      },
    ),
    /not made native/,
  );
  assert.deepEqual(calls, ["native"]);
});

test("dry-run verification does not require publish artifacts", () => {
  assert.doesNotThrow(() => verifyRelease({}, { options: { dryRun: true } }));
});

test("unmeasured or exceeded budgets prevent publication for both registries", () => {
  const report = {
    name: "@austindelic/austindelic",
    size: 100,
    unpackedSize: 200,
    executableBytes: 0,
  };
  const bundle = { packages: [report] };
  assert.throws(
    () => publisher.validateBudgets(bundle, {}),
    /measured size budget/,
  );
  const budgets = {
    austindelic: { size: 100, unpackedSize: 200, executableBytes: 0 },
  };
  assert.doesNotThrow(() => publisher.validateBudgets(bundle, budgets));
  assert.throws(
    () =>
      publisher.validateBudgets(
        { packages: [{ ...report, size: 106 }] },
        budgets,
      ),
    /exceeds/,
  );
});

test("final analysis must match the tested version, source and tag", () => {
  const bundle = {
    release: true,
    version: "1.0.0",
    sha: "a".repeat(40),
    tag: "tui-v1.0.0",
  };
  const next = {
    version: bundle.version,
    gitHead: bundle.sha,
    gitTag: bundle.tag,
  };
  assert.doesNotThrow(() => publisher.validateRelease(bundle, next));
  assert.throws(
    () => publisher.validateRelease({ ...bundle, release: false }, next),
    /Verification-only/,
  );
  assert.throws(
    () => publisher.validateRelease(bundle, { ...next, version: "1.0.1" }),
    /version changed/,
  );
  assert.throws(
    () =>
      publisher.validateRelease(bundle, { ...next, gitHead: "b".repeat(40) }),
    /source changed/,
  );
  assert.throws(
    () => publisher.validateRelease(bundle, { ...next, gitTag: "v1.0.0" }),
    /tag changed/,
  );
});
