// lib/sandbox.ts — Pure helpers for sandbox policy-state overrides.
// The sandbox stores only deviations from live state; the overrides map is the change list.

import type { ConditionalAccessPolicy, PolicyState } from '@/engine/models/Policy';

export type SandboxOverrides = Record<string, PolicyState>;

/**
 * Returns a new array with overridden policy states applied.
 * Live policy objects are never mutated — an overridden policy is a shallow
 * copy with the new state; untouched policies keep their original reference.
 */
export function applySandboxOverrides(
  policies: ConditionalAccessPolicy[],
  overrides: SandboxOverrides,
): ConditionalAccessPolicy[] {
  return policies.map((policy) => {
    const state = overrides[policy.id];
    return state !== undefined && state !== policy.state
      ? { ...policy, state }
      : policy;
  });
}

/**
 * Drops overrides that no longer deviate: policies that disappeared from the
 * tenant (renamed/deleted between refreshes) and overrides matching the
 * policy's live state (e.g. the admin applied the sandboxed change for real).
 */
export function pruneSandboxOverrides(
  policies: ConditionalAccessPolicy[],
  overrides: SandboxOverrides,
): SandboxOverrides {
  const liveStates = new Map(policies.map((p) => [p.id, p.state]));
  const pruned: SandboxOverrides = {};
  for (const [id, state] of Object.entries(overrides)) {
    if (liveStates.has(id) && liveStates.get(id) !== state) {
      pruned[id] = state;
    }
  }
  return pruned;
}
