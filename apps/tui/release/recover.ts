// Only recover artifacts from this repository's successfully tested main run.
import { readFileSync, appendFileSync } from "node:fs";
import assert from "node:assert/strict";
import publisher from "../scripts/publish.ts";

const id = process.env.RECOVERY_RUN_ID;
assert.match(id || "", /^\d+$/);
const base = "https://api.github.com/repos/austindelic/portfolio/actions";
async function get(url: string) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
    },
  });
  assert.ok(response.ok, `Cannot validate original run: ${response.status}`);
  return response.json();
}
const run = await get(`${base}/runs/${id}`);
assert.equal(run.head_branch, "main");
assert.equal(run.head_repository.full_name, "austindelic/portfolio");
assert.equal(run.path, ".github/workflows/release-tui.yml");
assert.ok(["push", "workflow_dispatch"].includes(run.event));
assert.equal(
  run.status,
  "completed",
  "Original run must finish before recovery",
);
const { jobs } = await get(
  `${base}/runs/${id}/jobs?filter=latest&per_page=100`,
);
assert.ok(
  jobs.some(
    (job: { name: string; conclusion: string }) =>
      job.name === "tested-bundle" && job.conclusion === "success",
  ),
  "Both package sets must have passed the full test matrix",
);
const bundle = JSON.parse(readFileSync("packed/release.json", "utf8"));
publisher.validateBundle("packed", bundle);
assert.equal(bundle.sha, run.head_sha);
assert.equal(bundle.runId, id);
assert.ok(bundle.release);
appendFileSync(process.env.GITHUB_OUTPUT!, `sha=${bundle.sha}\n`);
