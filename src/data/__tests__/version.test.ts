// version.test.ts — APP_VERSION and package.json must move together.
//
// They are two halves of one release step, and they drifted on v0.6.16:
// APP_VERSION was bumped and package.json was not. Nothing caught it, because
// nothing reads both — until scripts/sync-public.mjs, which names the public
// mirror's commit from package.json and would have pushed a second commit
// called v0.6.14.
//
// package.json is imported rather than read from disk: resolveJsonModule is
// already on, and this project deliberately carries no @types/node, so the
// node:fs route would not typecheck.

import { describe, it, expect } from 'vitest';
import pkg from '../../../package.json';
import { APP_VERSION } from '../theme';

describe('release version', () => {
  it('APP_VERSION carries a semver and the beta marker', () => {
    expect(APP_VERSION).toMatch(/^v\d+\.\d+\.\d+ beta$/);
  });

  it('matches package.json, which names the public mirror commit', () => {
    expect(`v${pkg.version} beta`).toBe(APP_VERSION);
  });
});
