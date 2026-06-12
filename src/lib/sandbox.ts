// lib/sandbox.ts — Pure helpers for sandbox policy overrides.
// The sandbox stores only deviations from live state; the override maps
// together ARE the change list. State overrides (v0.5) and assignment
// overrides (v0.7) are separate maps with the same normalization rules.

import type { ConditionalAccessPolicy, PolicyState } from '@/engine/models/Policy';

export type SandboxOverrides = Record<string, PolicyState>;

/** Each present key REPLACES that array on the live policy. */
export interface AssignmentOverride {
  includeUsers?: string[];
  excludeUsers?: string[];
  includeGroups?: string[];
  excludeGroups?: string[];
  includeRoles?: string[];
  excludeRoles?: string[];
  includeApplications?: string[];
  excludeApplications?: string[];
  includeAgentIdServicePrincipals?: string[];
  excludeAgentIdServicePrincipals?: string[];
}

export type AssignmentField = keyof AssignmentOverride;

export type SandboxAssignments = Record<string, AssignmentOverride>;

export const USER_ASSIGNMENT_FIELDS: readonly AssignmentField[] = [
  'includeUsers',
  'excludeUsers',
  'includeGroups',
  'excludeGroups',
  'includeRoles',
  'excludeRoles',
];

export const APP_ASSIGNMENT_FIELDS: readonly AssignmentField[] = [
  'includeApplications',
  'excludeApplications',
];

export const AGENT_ASSIGNMENT_FIELDS: readonly AssignmentField[] = [
  'includeAgentIdServicePrincipals',
  'excludeAgentIdServicePrincipals',
];

export const ASSIGNMENT_FIELD_LABELS: Record<AssignmentField, string> = {
  includeUsers: 'Included users',
  excludeUsers: 'Excluded users',
  includeGroups: 'Included groups',
  excludeGroups: 'Excluded groups',
  includeRoles: 'Included roles',
  excludeRoles: 'Excluded roles',
  includeApplications: 'Included applications',
  excludeApplications: 'Excluded applications',
  includeAgentIdServicePrincipals: 'Included agent identities',
  excludeAgentIdServicePrincipals: 'Excluded agent identities',
};

/** Order-insensitive array equality (assignment lists are sets in Entra). */
export function sameMembers(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((v) => setB.has(v));
}

/** Reads the live value of an assignment field off a policy. */
export function getAssignmentField(policy: ConditionalAccessPolicy, field: AssignmentField): string[] {
  if (field === 'includeApplications' || field === 'excludeApplications') {
    return policy.conditions.applications[field];
  }
  if (field === 'includeAgentIdServicePrincipals' || field === 'excludeAgentIdServicePrincipals') {
    return policy.conditions.clientApplications?.[field] ?? [];
  }
  return policy.conditions.users[field];
}

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
 * Applies state AND assignment overrides. Overridden policies become new
 * objects with new conditions.users / conditions.applications objects;
 * untouched policies keep their reference, live objects are never mutated.
 */
export function applySandboxEdits(
  policies: ConditionalAccessPolicy[],
  stateOverrides: SandboxOverrides,
  assignments: SandboxAssignments,
): ConditionalAccessPolicy[] {
  return policies.map((policy) => {
    const state = stateOverrides[policy.id];
    const assignment = assignments[policy.id];
    const stateChanged = state !== undefined && state !== policy.state;
    const fields = assignment ? (Object.keys(assignment) as AssignmentField[]) : [];
    if (!stateChanged && fields.length === 0) return policy;

    const userPatch: Partial<ConditionalAccessPolicy['conditions']['users']> = {};
    const appPatch: Partial<ConditionalAccessPolicy['conditions']['applications']> = {};
    const agentPatch: Record<string, string[]> = {};
    for (const field of fields) {
      const values = assignment![field];
      if (values === undefined) continue;
      if (field === 'includeApplications' || field === 'excludeApplications') {
        appPatch[field] = values;
      } else if (field === 'includeAgentIdServicePrincipals' || field === 'excludeAgentIdServicePrincipals') {
        agentPatch[field] = values;
      } else {
        userPatch[field] = values;
      }
    }

    const hasAgentPatch = Object.keys(agentPatch).length > 0;
    return {
      ...policy,
      ...(stateChanged ? { state } : {}),
      conditions: {
        ...policy.conditions,
        users: { ...policy.conditions.users, ...userPatch },
        applications: { ...policy.conditions.applications, ...appPatch },
        ...(hasAgentPatch
          ? {
              clientApplications: {
                includeServicePrincipals: [],
                excludeServicePrincipals: [],
                ...policy.conditions.clientApplications,
                ...agentPatch,
              },
            }
          : {}),
      },
    };
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

/**
 * Same idea for assignment overrides: drops entries for vanished policies and
 * field overrides now equal to the live value. A field whose LIVE value
 * changed underneath is kept — the sandbox states intent, not a 3-way merge.
 */
export function pruneSandboxAssignments(
  policies: ConditionalAccessPolicy[],
  assignments: SandboxAssignments,
): SandboxAssignments {
  const byId = new Map(policies.map((p) => [p.id, p]));
  const pruned: SandboxAssignments = {};
  for (const [id, override] of Object.entries(assignments)) {
    const policy = byId.get(id);
    if (!policy) continue;
    const kept: AssignmentOverride = {};
    for (const field of Object.keys(override) as AssignmentField[]) {
      const values = override[field];
      if (values !== undefined && !sameMembers(values, getAssignmentField(policy, field))) {
        kept[field] = values;
      }
    }
    if (Object.keys(kept).length > 0) pruned[id] = kept;
  }
  return pruned;
}
