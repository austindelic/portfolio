// The installed release plugins do not ship declarations. Describe the calls used here.
declare module "@semantic-release/commit-analyzer" {
  export function analyzeCommits(
    config: { preset: string },
    context: import("./plugin.ts").CommitContext,
  ): Promise<"major" | "minor" | "patch" | null>;
}
declare module "@semantic-release/release-notes-generator" {
  export function generateNotes(
    config: Record<string, never>,
    context: import("./plugin.ts").CommitContext,
  ): Promise<string>;
}
