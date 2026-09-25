import semanticRelease from "semantic-release";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import assert from "node:assert/strict";
import { publishSnapshot } from "./publish-snapshot.ts";

const mode = process.argv[2];
const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();
const options = {
  branches: ["main"],
  repositoryUrl: "https://github.com/austindelic/portfolio.git",
  tagFormat: "tui-v${version}",
  plugins: [fileURLToPath(new URL("./plugin.ts", import.meta.url))],
};

async function githubRelease(
  bundle: import("../scripts/release-types.ts").ReleaseBundle,
) {
  const repo = "austindelic/portfolio";
  const endpoint = `https://api.github.com/repos/${repo}/releases`;
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const found = await fetch(`${endpoint}/tags/${bundle.tag}`, { headers });
  assert.ok(
    found.ok || found.status === 404,
    `Cannot inspect GitHub Release: ${found.status}`,
  );
  const old = found.ok ? await found.json() : null;
  const body = `${bundle.notes || ""}\n\nPackages: [npm](https://www.npmjs.com/package/austindelic/v/${bundle.version}) · [GitHub Packages](https://github.com/austindelic/portfolio/packages)\n`;
  const response = await fetch(old ? `${endpoint}/${old.id}` : endpoint, {
    method: old ? "PATCH" : "POST",
    headers,
    body: JSON.stringify({
      tag_name: bundle.tag,
      target_commitish: bundle.sha,
      name: bundle.tag,
      body,
      draft: false,
      prerelease: false,
    }),
  });
  assert.ok(
    response.ok,
    `GitHub Release failed: ${response.status} ${await response.text()}`,
  );
}

if (mode === "plan") {
  const result = await semanticRelease({ ...options, dryRun: true });
  const version = result
    ? result.nextRelease.version
    : JSON.parse(readFileSync("apps/tui/npm/package.json", "utf8")).version;
  const plan = {
    schema: 1,
    release: Boolean(result),
    version,
    sha: git("rev-parse", "HEAD"),
    tag: `tui-v${version}`,
    notes: result ? result.nextRelease.notes : "",
    runId: process.env.GITHUB_RUN_ID || null,
  };
  writeFileSync("release-plan.json", JSON.stringify(plan, null, 2) + "\n");
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT!, `release=${plan.release}\n`);
} else if (mode === "publish" || mode === "recover") {
  assert.equal(
    process.env.GITHUB_REF,
    "refs/heads/main",
    "Publication requires main",
  );
  await publishSnapshot({ createRelease: githubRelease });
} else {
  throw new Error("Usage: node apps/tui/release/run.ts plan|publish|recover");
}
