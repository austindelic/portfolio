import { readFile } from "node:fs/promises";

// Whitespace-only compaction. Keep directive newlines and macro spacing intact;
// never rename identifiers, fold arithmetic, or alter numeric literals.
export function compactShader(source: string) {
  return source
    .replace(
      /\/\*[\s\S]*?\*\//g,
      (comment) => "\n".repeat(comment.split("\n").length - 1) + " ",
    )
    .replace(/\/\/[^\n]*/g, (comment) =>
      comment.startsWith("// SECTION 9: mainImage")
        ? "// SECTION 9: mainImage"
        : "",
    )
    .split("\n")
    .map((line) => {
      const trimmed = line.trim().replace(/[\t ]+/g, " ");
      if (trimmed.startsWith("#") || trimmed.startsWith("//")) return trimmed;
      return trimmed.replace(/[\t ]*([{}()[\],;])[\t ]*/g, "$1");
    })
    .filter(Boolean)
    .join("\n");
}

export function compactShaders(): import("vite").Plugin {
  return {
    name: "compact-black-hole-shaders",
    enforce: "pre",
    apply: "build",
    async load(id) {
      if (
        !/\/packages\/black-hole\/shaders\/[^?]+\.(?:glsl|wgsl)\?raw$/.test(id)
      )
        return;
      const path = id.slice(0, -4);
      this.addWatchFile(path);
      return `export default ${JSON.stringify(compactShader(await readFile(path, "utf8")))};`;
    },
  };
}
