import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import ts from "typescript";

// Playwright CLI wraps run-code input in parentheses: emit just the function.
const input = process.argv[2];
if (!input || !input.endsWith(".ts"))
  throw new Error("Usage: prepare:browser PATH.ts");
const source = readFileSync(input, "utf8");
const tree = ts.createSourceFile(
  input,
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const functions = tree.statements.filter(
  (statement) =>
    ts.isFunctionDeclaration(statement) ||
    ts.isExportAssignment(statement) ||
    (ts.isExpressionStatement(statement) &&
      (ts.isArrowFunction(statement.expression) ||
        ts.isFunctionExpression(statement.expression))),
);
if (functions.length !== 1)
  throw new Error("Expected one self-contained browser function");
const selected = functions[0];
const body = (
  ts.isExportAssignment(selected)
    ? selected.expression.getText(tree)
    : selected.getText(tree)
).replace(/^export default /, "");
const output = ts
  .transpileModule(body, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      alwaysStrict: false,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.trim()
  .replace(/;$/, "");
const local = relative(process.cwd(), resolve(input));
if (local.startsWith(".."))
  throw new Error("Browser source must be inside the repository");
const path = resolve(".playwright-cli/compiled", local.replace(/\.ts$/, ".js"));
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, output + "\n");
console.log(path);
