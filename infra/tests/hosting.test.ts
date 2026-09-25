import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const config = JSON.parse(readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8'));
test('deployment targets the existing static Worker and preserves routing policy', () => {
  assert.equal(config.name, 'austindelic');
  assert.equal(config.compatibility_date, '2026-09-21');
  assert.equal(config.assets.directory, './apps/portfolio/dist');
  assert.equal(config.assets.not_found_handling, '404-page');
  assert.equal(config.assets.html_handling, 'auto-trailing-slash');
  assert.equal(config.main, undefined);
  assert.equal(config.routes, undefined);
});
