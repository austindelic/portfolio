import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import publisher from '../scripts/publish.cjs';

const plan = JSON.parse(readFileSync('release-plan.json'));
assert.equal(plan.sha, execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
const packages = ['npm', 'github'].flatMap(registry => JSON.parse(readFileSync(`packed/${registry}/sizes.json`)));
const bundle = { ...plan, packages };
publisher.validateBundle('packed', bundle);
writeFileSync('packed/release.json', JSON.stringify(bundle, null, 2) + '\n');
