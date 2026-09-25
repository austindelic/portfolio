// Keep the workflow's push paths in sync with these release inputs.
export const releasePaths = [
  "apps/tui/",
  ".github/workflows/release-tui.yml",
  ".gitattributes",
  "apps/portfolio/src/data/portfolio.json",
  "apps/portfolio/src/content/blog/",
  "apps/portfolio/public/resume.pdf",
  "apps/portfolio/public/fonts/DepartureMono-Regular.woff2",
  "apps/portfolio/src/config/black-hole-routes.json",
];
export function relevantPath(file: string) {
  return releasePaths.some((p) =>
    p.endsWith("/") ? file.startsWith(p) : file === p,
  );
}
