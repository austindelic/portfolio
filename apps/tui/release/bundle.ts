import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import publisher from "../scripts/publish.ts";

const plan = JSON.parse(readFileSync("release-plan.json", "utf8"));
assert.equal(
  plan.sha,
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
);
const packages = ["npm", "github"].flatMap((registry) =>
  JSON.parse(readFileSync(`packed/${registry}/sizes.json`, "utf8")),
);
const bundle = { ...plan, packages };
publisher.validateBundle("packed", bundle);
writeFileSync("packed/release.json", JSON.stringify(bundle, null, 2) + "\n");
