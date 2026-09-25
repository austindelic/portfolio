import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { Script } from "node:vm";

const directories = [
  "apps/portfolio/scripts/perf",
  "apps/portfolio/tests",
  "apps/tui/scripts",
];
test("every browser audit compiles to a standalone Playwright function expression", () => {
  let count = 0;
  for (const directory of directories) {
    for (const name of readdirSync(directory)) {
      if (!name.endsWith(".ts")) continue;
      const input = resolve(directory, name);
      if (
        !readFileSync(input, "utf8").includes('import("@playwright/test").Page')
      )
        continue;
      const output = execFileSync(
        process.execPath,
        ["--import", "tsx", "tooling/prepare-browser.ts", input],
        { encoding: "utf8" },
      ).trim();
      const code = readFileSync(output, "utf8");
      assert.equal(
        typeof new Script(`(${code})`, { filename: input }).runInNewContext(),
        "function",
      );
      count++;
    }
  }
  assert.ok(
    count >= 5,
    `Expected the portfolio integration audit inventory, found ${count}`,
  );
});

// Ignored build output is allowed, but authored or tracked JavaScript is not.
test("the repository has no authored JavaScript files", () => {
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  ).split("\0");
  assert.deepEqual(
    files.filter((file) => /\.(?:mjs|cjs|js)$/.test(file) && existsSync(file)),
    [],
  );
});
