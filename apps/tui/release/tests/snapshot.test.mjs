import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Writable } from 'node:stream';
import semanticRelease from 'semantic-release';
import { publishSnapshot } from '../publish-snapshot.mjs';
import publisher from '../../scripts/publish.cjs';
import launcher from '../../npm/bin/cli.cjs';

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'tui snapshot '));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, 'checkout');
  const remote = path.join(root, 'remote.git');
  mkdirSync(cwd);
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '-b', 'main');
  git('config', 'user.name', 'Release Test');
  git('config', 'user.email', 'release-test@example.invalid');
  git('init', '--bare', '-b', 'main', remote);
  git('remote', 'add', 'origin', remote);
  let counter = 0;
  function commit(file, message) {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), String(++counter));
    git('add', file); git('commit', '-m', message);
    return git('rev-parse', 'HEAD');
  }
  const sha = commit('apps/tui/cli.rs', 'feat: initial terminal');
  git('push', 'origin', 'main');
  const bundle = { schema: 1, release: true, sha, version: '1.0.0', tag: 'tui-v1.0.0', notes: 'Saved release notes', packages: [] };
  const budgets = {};
  for (const [registry, { prefix, url }] of Object.entries(publisher.registries)) {
    mkdirSync(path.join(cwd, 'packed', registry), { recursive: true });
    for (const name of ['austindelic', ...launcher.targets.map(t => `austindelic-${t}`)]) {
      const filename = `${name}.tgz`;
      const bytes = Buffer.from(`${registry}/${name}`);
      writeFileSync(path.join(cwd, 'packed', registry, filename), bytes);
      budgets[name] = { size: 100, unpackedSize: 100, executableBytes: 100 };
      bundle.packages.push({ registry, name: prefix + name, filename, version: bundle.version,
        integrity: publisher.integrity(bytes), size: bytes.length, unpackedSize: bytes.length, executableBytes: 0,
        manifest: { name: prefix + name, version: bundle.version, publishConfig: { registry: url },
          ...(name === 'austindelic' ? { bin: {} } : {}) } });
    }
  }
  mkdirSync(path.join(cwd, 'apps/tui/scripts'), { recursive: true });
  writeFileSync(path.join(cwd, 'apps/tui/scripts/size-budgets.json'), JSON.stringify(budgets));
  const save = () => writeFileSync(path.join(cwd, 'packed/release.json'), JSON.stringify(bundle));
  save();
  const calls = [];
  const publish = async folder => {
    assert.equal(folder, path.join(cwd, 'packed'));
    assert.equal(git('--git-dir', remote, 'rev-parse', `${bundle.tag}^{commit}`), sha, 'Remote tag must exist before publishing');
    calls.push('packages');
  };
  const createRelease = async actual => { assert.deepEqual(actual, bundle); calls.push('release'); };
  const run = (overrides = {}) => publishSnapshot({ cwd, publish, createRelease, ...overrides });
  const plan = () => semanticRelease({ branches: ['main'], repositoryUrl: pathToFileURL(remote).href,
    tagFormat: 'tui-v${version}', dryRun: true,
    plugins: [fileURLToPath(new URL('../plugin.mjs', import.meta.url))] }, {
    cwd, env: { ...process.env, CI: 'true', GITHUB_ACTIONS: '', GITHUB_TOKEN: '', GH_TOKEN: '' },
    stdout: new Writable({ write(c, e, done) { done(); } }),
    stderr: new Writable({ write(c, e, done) { done(); } }),
  });
  return { cwd, remote, git, commit, sha, bundle, save, calls, run, plan };
}

test('publish the planned snapshot after main advances, then plan from the published tag', async t => {
  const f = fixture(t);
  assert.equal((await f.plan()).nextRelease.version, f.bundle.version);
  f.commit('README.md', 'Update unrelated readme');
  f.git('push', 'origin', 'main');
  f.git('checkout', '--detach', f.sha);
  await f.run();
  assert.deepEqual(f.calls, ['packages', 'release']);
  // A retry resumes the same tag and source without selecting another version.
  await f.run();
  f.git('checkout', 'main');
  assert.equal(await f.plan(), false, 'README changes alone need no release');
  f.commit('apps/tui/cli.rs', 'fix: improve terminal');
  f.git('push', 'origin', 'main');
  const next = await f.plan();
  assert.equal(next.lastRelease.gitHead, f.sha);
  assert.deepEqual(next.lastRelease.channels, [null]);
  assert.equal(next.nextRelease.version, '1.0.1');
});

test('recover an untagged bundle even when newer relevant changes are on main', async t => {
  const f = fixture(t);
  f.commit('apps/tui/cli.rs', 'feat: newer feature');
  f.git('push', 'origin', 'main');
  f.git('checkout', '--detach', f.sha);
  await f.run();
  assert.deepEqual(f.calls, ['packages', 'release']);
});

test('reject conflicting remote tags and newer releases before publishing', async t => {
  for (const tag of ['tui-v1.0.0', 'tui-v1.0.1', 'tui-v1.10.0', 'tui-v2.0.0']) {
    const f = fixture(t);
    f.commit('README.md', 'New commit');
    f.git('push', 'origin', 'main');
    f.git('tag', tag); f.git('push', 'origin', tag);
    f.git('tag', '-d', tag); // Ensure the guard reads remote state.
    f.git('checkout', '--detach', f.sha);
    await assert.rejects(f.run(), /different source|newer release exists/);
    assert.deepEqual(f.calls, []);
  }
});

test('reject main rewritten behind the tested commit', async t => {
  const f = fixture(t);
  const tested = f.commit('apps/tui/cli.rs', 'fix: tested change');
  f.git('push', 'origin', 'main');
  f.bundle.sha = tested; f.save();
  f.git('push', '--force', 'origin', `${f.sha}:refs/heads/main`);
  await assert.rejects(f.run(), /no longer an ancestor/);
  assert.deepEqual(f.calls, []);
});

test('reject unrelated rewritten main with an actionable error', async t => {
  const f = fixture(t);
  f.git('checkout', '--orphan', 'replacement');
  f.commit('README.md', 'Replace history');
  f.git('push', '--force', 'origin', 'HEAD:refs/heads/main');
  f.git('checkout', '--detach', f.sha);
  await assert.rejects(f.run(), /no longer an ancestor/);
  assert.deepEqual(f.calls, []);
});

test('an existing annotated tag at the tested commit can resume publication', async t => {
  const f = fixture(t);
  f.git('tag', '-a', f.bundle.tag, '-m', 'Existing release', f.sha);
  f.git('push', 'origin', f.bundle.tag);
  const original = f.git('--git-dir', f.remote, 'rev-parse', f.bundle.tag);
  await f.run();
  assert.equal(f.git('--git-dir', f.remote, 'rev-parse', f.bundle.tag), original);
  assert.deepEqual(f.calls, ['packages', 'release']);
});

test('a rejected tag push stops package publication', async t => {
  const f = fixture(t);
  writeFileSync(path.join(f.remote, 'hooks/pre-receive'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  await assert.rejects(f.run(), /pre-receive hook declined/);
  assert.deepEqual(f.calls, []);
});

test('invalid artifacts, budgets, source and verification-only plans cannot create tags', async t => {
  for (const kind of ['archive', 'budget', 'source', 'verification']) {
    const f = fixture(t);
    if (kind === 'archive') appendFileSync(path.join(f.cwd, 'packed/npm/austindelic.tgz'), 'tampered');
    if (kind === 'budget') f.bundle.packages[0].size = 1000;
    if (kind === 'source') f.commit('README.md', 'Wrong checkout');
    if (kind === 'verification') f.bundle.release = false;
    f.save();
    await assert.rejects(f.run(), /changed after testing|exceeds accepted size|Checkout must match|Verification-only/);
    assert.equal(f.git('ls-remote', '--tags', 'origin'), '');
    assert.deepEqual(f.calls, []);
  }
});

test('partial publication keeps its tag and resumes identical packages before creating a release', async t => {
  const f = fixture(t);
  const stored = new Map(); const sent = [];
  let fail = true;
  const publish = async folder => {
    const reports = JSON.parse(readFileSync(path.join(folder, 'release.json'))).packages;
    await publisher.publishReports(reports, {
      existing: p => stored.get(`${p.registry}/${p.name}`),
      publish(p) {
        if (stored.size === 2 && fail) throw new Error('Registry unavailable');
        const key = `${p.registry}/${p.name}`;
        stored.set(key, p.integrity); sent.push(key);
      },
    });
  };
  await assert.rejects(f.run({ publish }), /Registry unavailable/);
  assert.deepEqual(f.calls, [], 'No GitHub Release for an incomplete publication');
  assert.equal(f.git('--git-dir', f.remote, 'rev-parse', f.bundle.tag), f.sha);
  fail = false;
  await f.run({ publish });
  assert.equal(sent.length, 12, 'Already published archives are not republished');
  assert.deepEqual(f.calls, ['release']);
});
