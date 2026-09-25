import type { ReleaseBundle } from "../scripts/release-types.ts";
export interface SnapshotOptions {
  cwd?: string;
  directory?: string;
  publish?: (directory: string) => Promise<void>;
  createRelease: (bundle: ReleaseBundle) => Promise<void>;
}
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import publisher from "../scripts/publish.ts";

// Both normal publication and recovery consume the immutable, tested plan.
export async function publishSnapshot({
  cwd = process.cwd(),
  directory = "packed",
  publish = publisher.publishAll,
  createRelease,
}: SnapshotOptions) {
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const folder = path.resolve(cwd, directory);
  const bundle: ReleaseBundle = JSON.parse(
    readFileSync(path.join(folder, "release.json"), "utf8"),
  );
  publisher.validateBundle(folder, bundle);
  assert.ok(bundle.release, "Verification-only artifact cannot be published");
  assert.equal(
    git("rev-parse", "HEAD"),
    bundle.sha,
    "Checkout must match the tested source",
  );
  publisher.validateBudgets(
    bundle,
    JSON.parse(
      readFileSync(
        path.join(cwd, "apps/tui/scripts/size-budgets.json"),
        "utf8",
      ),
    ),
  );

  // A separate namespace makes remote tags authoritative, including on retries
  // with stale local tags. Updating these fetched refs never moves remote tags.
  git(
    "fetch",
    "--no-tags",
    "--prune",
    "origin",
    "+refs/heads/main:refs/remotes/origin/main",
    "+refs/tags/*:refs/release-tags/*",
  );
  const ancestry = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", bundle.sha, "refs/remotes/origin/main"],
    { cwd, encoding: "utf8" },
  );
  if (ancestry.error) throw ancestry.error;
  assert.ok(
    ancestry.status === 0 || ancestry.status === 1,
    `Cannot check main ancestry: ${ancestry.stderr}`,
  );
  assert.equal(
    ancestry.status,
    0,
    "Tested source is no longer an ancestor of main; verify a new release after the history rewrite",
  );
  const refs = git(
    "for-each-ref",
    "--format=%(refname)",
    "refs/release-tags/",
  ).split("\n");
  const current = bundle.version.split(".").map(BigInt);
  for (const ref of refs) {
    const match = /^refs\/release-tags\/tui-v(\d+)\.(\d+)\.(\d+)$/.exec(ref);
    if (!match) continue;
    const parts = match.slice(1).map(BigInt);
    const index = parts.findIndex((part, i) => part !== current[i]);
    assert.ok(
      index < 0 || parts[index] < current[index],
      `A newer release exists (${ref.split("/").pop()}); refusing to move registry latest tags backwards`,
    );
  }
  const tagRef = `refs/release-tags/${bundle.tag}`;
  if (refs.includes(tagRef)) {
    assert.equal(
      git("rev-parse", `${tagRef}^{commit}`),
      bundle.sha,
      `Release tag ${bundle.tag} points to different source; cannot reuse this version`,
    );
  } else {
    // No force: a concurrent conflicting tag fails before any package is sent.
    // For stable main releases semantic-release treats tags without channel
    // notes as [null], its default release channel.
    git("push", "origin", `${bundle.sha}:refs/tags/${bundle.tag}`);
  }
  await publish(folder);
  await createRelease(bundle);
}
