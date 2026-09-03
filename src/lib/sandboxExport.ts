// lib/sandboxExport.ts — Change plan generation for sandbox state.
//
// Turns the sandbox's deviations (state toggles, assignment edits, drafts)
// into deployable artifacts: Graph JSON, a Microsoft Graph PowerShell script,
// and a Markdown change summary. Pure and synchronous — the app itself never
// writes to the tenant; artifacts are generated in-browser for download.
//
// Graph PATCH semantics note: nested objects are replaced wholesale, so any
// assignment change exports the policy's COMPLETE conditions object (with
// edits applied) rather than a partial nested patch.

import type { ConditionalAccessPolicy, PolicyConditions, PolicyState, GuestOrExternalUserCondition } from '@/engine/models/Policy';
import {
  applySandboxEdits,
  type SandboxOverrides,
  type SandboxAssignments,
} from './sandbox';
import { describeSandboxChanges, type SandboxChange } from './sandboxDiff';

// ── Types ───────────────────────────────────────────────────────────

/** State applied to exported NEW policies (sandbox state is never exported for creations). */
export type ExportNewPolicyState = 'disabled' | 'enabledForReportingButNotEnforced';

export interface PolicyModification {
  policyId: string;
  policyName: string;
  change: SandboxChange;
  /** Graph PATCH body — state and/or the complete updated conditions object */
  patchBody: Record<string, unknown>;
  /** Agent-bearing policies must PATCH via beta — v1.0 silently strips agent targeting */
  requiresBetaEndpoint: boolean;
}

export interface PolicyCreation {
  draftId: string;
  /** Display name with the [Draft] prefix stripped */
  policyName: string;
  /** Complete Graph POST body */
  policyBody: Record<string, unknown>;
  /** Set when the draft is scoped to individual accounts — a stand-in for a group the tool cannot know */
  deployNote?: string;
}

export interface ChangePlan {
  modifications: PolicyModification[];
  creations: PolicyCreation[];
  summaryMarkdown: string;
  powershellScript: string;
  /** Combined JSON artifact (modifications + creations) */
  jsonDocument: string;
}

// ── Graph body builders ─────────────────────────────────────────────

const DRAFT_PREFIX = '[Draft] ';

export function stripDraftPrefix(name: string): string {
  return name.startsWith(DRAFT_PREFIX) ? name.slice(DRAFT_PREFIX.length) : name;
}

/**
 * Serializes conditions to the Graph wire format. The internal model mirrors
 * Graph closely, with three deliberate divergences fixed here:
 * - clientAppTypes: internal [] means "matches all" (Hard-Won Lesson #7), but
 *   Graph REQUIRES the property on create — serialize as ['all'].
 * - insiderRiskLevels: internal string[] for matcher simplicity, but Graph
 *   models conditionalAccessInsiderRiskLevels as a single comma-flagged
 *   string — serialize joined, omitted when empty.
 * - guest/external user externalTenants: Graph requires an @odata.type
 *   discriminator; default to "all external tenants" when absent.
 */
export function toGraphConditions(conditions: PolicyConditions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ...conditions,
    clientAppTypes: conditions.clientAppTypes.length === 0 ? ['all'] : conditions.clientAppTypes,
  };

  if (conditions.insiderRiskLevels?.length) {
    body.insiderRiskLevels = conditions.insiderRiskLevels.join(',');
  } else {
    delete body.insiderRiskLevels;
  }

  // Agent risk is the same flagged-string wire format (beta)
  if (conditions.agentIdRiskLevels?.length) {
    body.agentIdRiskLevels = conditions.agentIdRiskLevels.join(',');
  } else {
    delete body.agentIdRiskLevels;
  }

  const users = conditions.users;
  if (users.includeGuestsOrExternalUsers || users.excludeGuestsOrExternalUsers) {
    body.users = {
      ...users,
      ...(users.includeGuestsOrExternalUsers
        ? { includeGuestsOrExternalUsers: toGraphGuestCondition(users.includeGuestsOrExternalUsers) }
        : {}),
      ...(users.excludeGuestsOrExternalUsers
        ? { excludeGuestsOrExternalUsers: toGraphGuestCondition(users.excludeGuestsOrExternalUsers) }
        : {}),
    };
  }

  return body;
}

function toGraphGuestCondition(g: GuestOrExternalUserCondition): Record<string, unknown> {
  const tenants = g.externalTenants;
  return {
    guestOrExternalUserTypes: g.guestOrExternalUserTypes,
    externalTenants: tenants?.membershipKind === 'enumerated'
      ? {
          '@odata.type': '#microsoft.graph.conditionalAccessEnumeratedExternalTenants',
          membershipKind: 'enumerated',
          members: tenants.members ?? [],
        }
      : {
          '@odata.type': '#microsoft.graph.conditionalAccessAllExternalTenants',
          membershipKind: 'all',
        },
  };
}

/** Serializes grant controls for Graph (auth strength as an id-only relationship). */
function toGraphGrantControls(gc: ConditionalAccessPolicy['grantControls']): Record<string, unknown> | undefined {
  if (!gc) return undefined;
  const body: Record<string, unknown> = {
    operator: gc.operator,
    builtInControls: gc.builtInControls,
  };
  if (gc.customAuthenticationFactors?.length) body.customAuthenticationFactors = gc.customAuthenticationFactors;
  if (gc.termsOfUse?.length) body.termsOfUse = gc.termsOfUse;
  if (gc.authenticationStrength) body.authenticationStrength = { id: gc.authenticationStrength.id };
  return body;
}

/** Complete POST body for a new policy. */
export function toGraphCreateBody(
  policy: ConditionalAccessPolicy,
  state: ExportNewPolicyState,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    displayName: stripDraftPrefix(policy.displayName),
    state,
    conditions: toGraphConditions(policy.conditions),
  };
  const grant = toGraphGrantControls(policy.grantControls);
  if (grant) body.grantControls = grant;
  if (policy.sessionControls) body.sessionControls = policy.sessionControls;
  return body;
}

/** Minimal PATCH body: state if toggled; complete conditions if assignments changed. */
export function toGraphPatchBody(
  change: SandboxChange,
  effectivePolicy: ConditionalAccessPolicy,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (change.stateChange) body.state = change.stateChange.to;
  if (change.fieldChanges.length > 0) body.conditions = toGraphConditions(effectivePolicy.conditions);
  return body;
}

// ── Artifact generators ─────────────────────────────────────────────

const STATE_LABELS: Record<PolicyState, string> = {
  enabled: 'On',
  enabledForReportingButNotEnforced: 'Report-only',
  disabled: 'Off',
};

/** includeUsers values that name a population rather than an account */
const SPECIAL_USER_VALUES: ReadonlySet<string> = new Set(['All', 'None', 'GuestsOrExternalUsers', 'AllAgentIdUsers']);

const CHECKLIST = [
  'Verify break-glass / emergency access accounts are excluded from every policy before deploying.',
  'Test with a pilot group before organization-wide rollout.',
  'New policies are exported in a non-enforcing state — review sign-in logs before enabling.',
  'Note: report-only policies that require compliant devices can prompt users for device certificates on some platforms.',
  'Note: the Entra portal "Upload policy file" dialog asks for the policy state again and overrides the value in the JSON.',
];

function buildSummaryMarkdown(
  modifications: PolicyModification[],
  creations: PolicyCreation[],
  newPolicyState: ExportNewPolicyState,
): string {
  const lines: string[] = [
    '# Conditional Access change plan',
    '',
    `Generated by CA Simulator (sandbox export). ${modifications.length} ${modifications.length === 1 ? 'modification' : 'modifications'}, ${creations.length} new ${creations.length === 1 ? 'policy' : 'policies'}.`,
    '',
  ];

  if (modifications.length > 0) {
    lines.push('## Modified policies', '');
    for (const mod of modifications) {
      lines.push(`### ${mod.policyName}`);
      if (mod.change.stateChange) {
        lines.push(`- State: ${STATE_LABELS[mod.change.stateChange.from]} → ${STATE_LABELS[mod.change.stateChange.to]}`);
      }
      for (const fc of mod.change.fieldChanges) {
        const parts: string[] = [];
        if (fc.added.length > 0) parts.push(`added ${fc.added.join(', ')}`);
        if (fc.removed.length > 0) parts.push(`removed ${fc.removed.join(', ')}`);
        lines.push(`- ${fc.fieldLabel}: ${parts.join('; ')}`);
      }
      lines.push('');
    }
  }

  if (creations.length > 0) {
    lines.push('## New policies', '');
    for (const creation of creations) {
      lines.push(`- **${creation.policyName}** — exported as ${STATE_LABELS[newPolicyState]}`);
      if (creation.deployNote) lines.push(`  - Note: ${creation.deployNote}`);
    }
    lines.push('');
  }

  lines.push('## Deployment checklist', '');
  for (const item of CHECKLIST) {
    lines.push(`- [ ] ${item}`);
  }
  lines.push('');

  return lines.join('\n');
}

function buildPowershellScript(
  modifications: PolicyModification[],
  creations: PolicyCreation[],
): string {
  const lines: string[] = [
    '# Conditional Access change plan — generated by CA Simulator (sandbox export)',
    '# REVIEW BEFORE RUNNING:',
    ...CHECKLIST.map((c) => `#   - ${c}`),
    '',
    "Connect-MgGraph -Scopes 'Policy.ReadWrite.ConditionalAccess'",
    '',
  ];

  for (const mod of modifications) {
    lines.push(`# ── Modify: ${mod.policyName} ──`);
    if (mod.change.stateChange) {
      lines.push(`#    State: ${STATE_LABELS[mod.change.stateChange.from]} -> ${STATE_LABELS[mod.change.stateChange.to]}`);
    }
    for (const fc of mod.change.fieldChanges) {
      const parts: string[] = [];
      if (fc.added.length > 0) parts.push(`added ${fc.added.join(', ')}`);
      if (fc.removed.length > 0) parts.push(`removed ${fc.removed.join(', ')}`);
      lines.push(`#    ${fc.fieldLabel}: ${parts.join('; ')}`);
    }
    if (mod.requiresBetaEndpoint) {
      lines.push('#    Uses the beta endpoint: this policy carries agent targeting, which v1.0 writes would strip.');
    }
    const apiVersion = mod.requiresBetaEndpoint ? 'beta' : 'v1.0';
    lines.push(
      `Invoke-MgGraphRequest -Method PATCH -Uri 'https://graph.microsoft.com/${apiVersion}/identity/conditionalAccess/policies/${mod.policyId}' -ContentType 'application/json' -Body @'`,
      JSON.stringify(mod.patchBody, null, 2),
      "'@",
      '',
    );
  }

  for (const creation of creations) {
    lines.push(`# ── Create: ${creation.policyName} ──`);
    if (creation.deployNote) lines.push(`#    ${creation.deployNote}`);
    lines.push(
      `Invoke-MgGraphRequest -Method POST -Uri 'https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies' -ContentType 'application/json' -Body @'`,
      JSON.stringify(creation.policyBody, null, 2),
      "'@",
      '',
    );
  }

  return lines.join('\n');
}

// ── Main entry ──────────────────────────────────────────────────────

export function buildChangePlan(
  livePolicies: ConditionalAccessPolicy[],
  overrides: SandboxOverrides,
  assignments: SandboxAssignments,
  drafts: Record<string, ConditionalAccessPolicy>,
  displayNames: ReadonlyMap<string, string> | undefined,
  newPolicyState: ExportNewPolicyState,
): ChangePlan {
  const changes = describeSandboxChanges(livePolicies, overrides, assignments, displayNames, drafts);
  const effective = applySandboxEdits(livePolicies, overrides, assignments);
  const effectiveById = new Map(effective.map((p) => [p.id, p]));

  const modifications: PolicyModification[] = [];
  const creations: PolicyCreation[] = [];

  for (const change of changes) {
    if (change.isNew) {
      const draft = drafts[change.policyId];
      if (!draft) continue;
      // A draft scoped to named accounts (the operator template) stands in for a
      // group the tool cannot know — say so where the admin will read it.
      const individuals = draft.conditions.users.includeUsers.filter((id) => !SPECIAL_USER_VALUES.has(id));
      const deployNote = individuals.length > 0
        ? `Scoped to individual account${individuals.length === 1 ? '' : 's'} (${individuals
            .map((id) => displayNames?.get(id) ?? id)
            .join(', ')}) as a stand-in for a group — replace with the intended group before deploying.`
        : undefined;
      creations.push({
        draftId: change.policyId,
        policyName: stripDraftPrefix(draft.displayName),
        policyBody: toGraphCreateBody(draft, newPolicyState),
        ...(deployNote ? { deployNote } : {}),
      });
    } else {
      const effectivePolicy = effectiveById.get(change.policyId);
      if (!effectivePolicy) continue;
      const requiresBetaEndpoint =
        effectivePolicy.conditions.clientApplications !== undefined ||
        (effectivePolicy.conditions.agentIdRiskLevels?.length ?? 0) > 0;
      modifications.push({
        policyId: change.policyId,
        policyName: change.policyName,
        change,
        patchBody: toGraphPatchBody(change, effectivePolicy),
        requiresBetaEndpoint,
      });
    }
  }

  const jsonDocument = JSON.stringify(
    {
      generatedBy: 'CA Simulator sandbox export',
      modifications: modifications.map((m) => ({
        policyId: m.policyId,
        displayName: m.policyName,
        apiVersion: m.requiresBetaEndpoint ? 'beta' : 'v1.0',
        patch: m.patchBody,
      })),
      creations: creations.map((c) => c.policyBody),
    },
    null,
    2,
  );

  return {
    modifications,
    creations,
    summaryMarkdown: buildSummaryMarkdown(modifications, creations, newPolicyState),
    powershellScript: buildPowershellScript(modifications, creations),
    jsonDocument,
  };
}
