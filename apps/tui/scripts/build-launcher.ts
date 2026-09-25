import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Keep npm's public entry point compatible with Node 22 without a TS runtime.
const source = new URL("../npm/bin/cli.ts", import.meta.url);
const output = new URL("../npm/bin/cli.cjs", import.meta.url);
const result = ts.transpileModule(readFileSync(source, "utf8"), {
  fileName: fileURLToPath(source),
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
});
writeFileSync(output, result.outputText);
chmodSync(output, 0o755);
