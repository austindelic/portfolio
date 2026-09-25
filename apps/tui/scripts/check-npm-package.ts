import type {
  PackageReport,
  PackageManifest,
  SizeBudgets,
} from "./release-types.ts";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { targets } from "../npm/bin/cli.ts";
const folder = path.resolve(process.argv[2] || "packed");
const reports: PackageReport[] = JSON.parse(
  fs.readFileSync(path.join(folder, "sizes.json"), "utf8"),
);
const prefix = reports[0].registry === "github" ? "@austindelic/" : "";
assert.deepEqual(
  reports.map((p) => p.name).sort(),
  [
    prefix + "austindelic",
    ...targets.map((t) => `${prefix}austindelic-${t}`),
  ].sort(),
);
for (const report of reports) {
  assert.equal(report.version, require("../npm/package.json").version);
  assert.equal(
    fs.statSync(path.join(folder, report.filename)).size,
    report.size,
  );
}
import storedBudgets from "./size-budgets.json";
const budgets: SizeBudgets = storedBudgets;
const launcher = reports.find(
  (p: { name: string }) => p.name === prefix + "austindelic",
);
assert.ok(launcher, "Packed launcher is required");
const comparison = [];
const baselinePackage = JSON.parse(
  fs.readFileSync(path.join(folder, "baseline-package.json"), "utf8"),
);
for (const report of reports) {
  const bareName = report.name.slice(prefix.length);
  const budget = budgets[bareName];
  if (process.env.RELEASE_TAG)
    assert.ok(
      budget,
      `Accept a measured size budget for ${report.name} before publishing`,
    );
  if (!budget)
    console.warn(
      `No accepted fixed size budget yet for ${report.name}; record the first successful platform build before setting one.`,
    );
  if (budget) {
    for (const metric of ["size", "unpackedSize", "executableBytes"] as const) {
      assert.ok(
        report[metric] <= Math.ceil(budget[metric] * 1.05),
        `${report.name} ${metric} exceeds accepted size + 5%`,
      );
    }
  }
  if (bareName !== "austindelic") {
    const target = bareName.replace("austindelic-", "");
    const baselinePath = path.resolve("release/measurements", `${target}.json`);
    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    assert.ok(
      report.executableBytes <= baseline.executableBytes,
      `${target} binary grew relative to baseline`,
    );
    comparison.push({
      target,
      baselinePackage,
      baseline,
      optimized: report,
      installedBytes: launcher!.unpackedSize + report.unpackedSize,
      downloadBytes: launcher!.size + report.size,
      budgetEstablished: Boolean(budget),
    });
  }
}
fs.writeFileSync(
  path.join(folder, "comparison.json"),
  JSON.stringify(comparison, null, 2) + "\n",
);
console.log("Validated all six packages; size comparison written.");
