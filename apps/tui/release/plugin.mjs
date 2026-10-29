import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { analyzeCommits as conventional } from '@semantic-release/commit-analyzer';
import { generateNotes as notes } from '@semantic-release/release-notes-generator';
import { relevantPath } from './paths.mjs';
import publisher from '../scripts/publish.cjs';

export function relevantCommits(context) {
  return context.commits.filter(commit => {
    // Compare merges to the first parent, so unrelated branch commits cannot
    // cause a release solely because the merge's other parent differs.
    const files = execFileSync('git', ['diff-tree', '--root', '--first-parent',
      '-m', '--no-commit-id', '--name-only', '-r', '-z', commit.hash],
    { cwd: context.cwd, encoding: 'utf8' }).split('\0');
    return files.some(relevantPath);
  });
}
export async function analyzeCommits(config, context) {
  const commits = relevantCommits(context);
  if (!commits.length) return null;
  return await conventional({ preset: 'angular' }, { ...context, commits }) || 'patch';
}
export async function generateNotes(config, context) {
  const commits = relevantCommits(context);
  const conventionalNotes = await notes({}, { ...context, commits });
  const other = commits.filter(commit => !/^(feat|fix|perf)(\([^\n]*\))?!?:/.test(commit.message));
  return conventionalNotes + (other.length ? '\n### Other changes\n\n' + other.map(commit =>
    `- ${commit.message.split('\n')[0]} (${commit.hash.slice(0, 7)})`).join('\n') + '\n' : '');
}
export function verifyRelease(config, context) {
  if (context.options.dryRun) return;
  const bundle = JSON.parse(readFileSync('packed/release.json'));
  publisher.validateBundle('packed', bundle);
  publisher.validateBudgets(bundle, JSON.parse(readFileSync('apps/tui/scripts/size-budgets.json')));
  publisher.validateRelease(bundle, context.nextRelease);
}
export async function publish() {
  await publisher.publishAll('packed');
  return { name: 'npm and GitHub Packages', url: 'https://www.npmjs.com/package/austindelic' };
}
