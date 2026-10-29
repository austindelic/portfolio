import semanticRelease from 'semantic-release';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import publisher from '../scripts/publish.cjs';

const mode = process.argv[2];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const options = {
  branches: ['main'],
  repositoryUrl: 'https://github.com/austindelic/austindelic.git',
  tagFormat: 'tui-v${version}',
  plugins: [fileURLToPath(new URL('./plugin.mjs', import.meta.url))],
};

async function githubRelease(bundle) {
  const repo = 'austindelic/austindelic';
  const endpoint = `https://api.github.com/repos/${repo}/releases`;
  const headers = { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' };
  const found = await fetch(`${endpoint}/tags/${bundle.tag}`, { headers });
  assert.ok(found.ok || found.status === 404, `Cannot inspect GitHub Release: ${found.status}`);
  const old = found.ok ? await found.json() : null;
  const body = `${bundle.notes || ''}\n\nPackages: [npm](https://www.npmjs.com/package/austindelic/v/${bundle.version}) · [GitHub Packages](https://github.com/austindelic/austindelic/packages)\n`;
  const response = await fetch(old ? `${endpoint}/${old.id}` : endpoint, {
    method: old ? 'PATCH' : 'POST', headers,
    body: JSON.stringify({ tag_name: bundle.tag, target_commitish: bundle.sha, name: bundle.tag, body, draft: false, prerelease: false }),
  });
  assert.ok(response.ok, `GitHub Release failed: ${response.status} ${await response.text()}`);
}

if (mode === 'plan') {
  const result = await semanticRelease({ ...options, dryRun: true });
  const version = result ? result.nextRelease.version : JSON.parse(readFileSync('apps/tui/npm/package.json')).version;
  const plan = {
    schema: 1, release: Boolean(result), version, sha: git('rev-parse', 'HEAD'),
    tag: `tui-v${version}`, notes: result ? result.nextRelease.notes : '',
    runId: process.env.GITHUB_RUN_ID || null,
  };
  writeFileSync('release-plan.json', JSON.stringify(plan, null, 2) + '\n');
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `release=${plan.release}\n`);
} else if (mode === 'publish' || mode === 'recover') {
  assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'Publication requires main');
  const bundle = JSON.parse(readFileSync('packed/release.json'));
  publisher.validateBundle('packed', bundle);
  assert.ok(bundle.release, 'Verification-only artifact cannot be published');
  assert.equal(git('rev-parse', 'HEAD'), bundle.sha, 'Checkout must match the tested source');
  if (mode === 'recover') {
    const tags = git('tag', '--list', 'tui-v*').split('\n').filter(Boolean);
    const numeric = v => v.replace(/^tui-v/, '').split('.').map(Number);
    const current = numeric(bundle.version);
    for (const tag of tags.filter(t => /^tui-v\d+\.\d+\.\d+$/.test(t))) {
      const parts = numeric(tag);
      const index = parts.findIndex((part, i) => part !== current[i]);
      assert.ok(index < 0 || parts[index] < current[index], 'A newer release exists; do not move registry latest tags backwards');
    }
    if (tags.includes(bundle.tag)) {
      assert.equal(git('rev-parse', `${bundle.tag}^{commit}`), bundle.sha, 'Recovery requires the original release tag');
      await publisher.publishAll('packed');
    } else {
      // Also activates an already-tested first release after bootstrap, without
      // rebuilding packages whose bytes may already exist on npm.
      assert.ok(await semanticRelease(options), 'Release plan is stale; cannot publish these artifacts');
    }
  } else {
    const result = await semanticRelease(options);
    assert.ok(result, 'No release selected; use recovery for an already-tagged release');
  }
  await githubRelease(bundle);
} else {
  throw new Error('Usage: node apps/tui/release/run.mjs plan|publish|recover');
}
