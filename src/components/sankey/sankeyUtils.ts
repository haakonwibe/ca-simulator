// components/sankey/sankeyUtils.ts — Transform CAEngineResult into Sankey node/link graph.

import type { CAEngineResult, PolicyEvaluationResult } from '@/engine/models/EvaluationResult';
import type { ConditionalAccessPolicy } from '@/engine/models/Policy';
import { COLORS } from '@/data/theme';
import { findEvalResult } from '@/components/matrix/matrixUtils';

// ── Types ────────────────────────────────────────────────────────────

export const STAGES = ['All', 'State', 'Users', 'Apps', 'Other', 'Verdict'] as const;

export interface FlowNode {
  id: string;
  label: string;
  count: number;
  stage: number;
  nodeType: 'source' | 'filter' | 'dropout' | 'verdict';
  color: string;
  policies: string[];
}

export interface FlowLink {
  source: string;
  target: string;
  value: number;
  policies: string[];
  type: 'flow' | 'dropout';
}

export interface SankeyData {
  nodes: FlowNode[];
  links: FlowLink[];
}

// ── Node definitions ─────────────────────────────────────────────────

interface NodeDef {
  id: string;
  label: string;
  stage: number;
  nodeType: FlowNode['nodeType'];
  color: string;
}

const NODE_DEFS: Record<string, NodeDef> = {
  'stage-0-all':              { id: 'stage-0-all',              label: 'All Policies',     stage: 0, nodeType: 'source',  color: COLORS.accent },
  'stage-1-enabled':          { id: 'stage-1-enabled',          label: 'Enabled',          stage: 1, nodeType: 'filter',  color: COLORS.accent },
  'stage-1-disabled':         { id: 'stage-1-disabled',         label: 'Disabled',         stage: 1, nodeType: 'dropout', color: COLORS.textDim },
  'stage-1-report-only':      { id: 'stage-1-report-only',      label: 'Report-Only',      stage: 1, nodeType: 'filter',  color: COLORS.reportOnly },
  'stage-2-users':            { id: 'stage-2-users',            label: 'User Match',       stage: 2, nodeType: 'filter',  color: COLORS.accent },
  'stage-2-dropout-users':    { id: 'stage-2-dropout-users',    label: 'User Fail',        stage: 2, nodeType: 'dropout', color: COLORS.textDim },
  'stage-3-apps':             { id: 'stage-3-apps',             label: 'App Match',        stage: 3, nodeType: 'filter',  color: COLORS.accent },
  'stage-3-dropout-apps':     { id: 'stage-3-dropout-apps',     label: 'App Fail',         stage: 3, nodeType: 'dropout', color: COLORS.textDim },
  'stage-4-other':            { id: 'stage-4-other',            label: 'All Conditions',   stage: 4, nodeType: 'filter',  color: COLORS.accent },
  'stage-4-dropout-other':    { id: 'stage-4-dropout-other',    label: 'Other Fail',       stage: 4, nodeType: 'dropout', color: COLORS.textDim },
  'stage-5-block':            { id: 'stage-5-block',            label: 'Block',            stage: 5, nodeType: 'verdict', color: COLORS.blocked },
  'stage-5-controls':         { id: 'stage-5-controls',         label: 'Controls Required', stage: 5, nodeType: 'verdict', color: COLORS.unsatisfied },
  'stage-5-allow':            { id: 'stage-5-allow',            label: 'Allow',            stage: 5, nodeType: 'verdict', color: COLORS.granted },
  'stage-5-report-only':      { id: 'stage-5-report-only',      label: 'Report-Only',      stage: 5, nodeType: 'verdict', color: COLORS.reportOnly },
  // Report-only parallel track through condition stages
  'stage-2-ro-users':         { id: 'stage-2-ro-users',         label: 'User Match (RO)',  stage: 2, nodeType: 'filter',  color: COLORS.reportOnly },
  'stage-3-ro-apps':          { id: 'stage-3-ro-apps',          label: 'App Match (RO)',   stage: 3, nodeType: 'filter',  color: COLORS.reportOnly },
  'stage-4-ro-other':         { id: 'stage-4-ro-other',         label: 'All Cond. (RO)',   stage: 4, nodeType: 'filter',  color: COLORS.reportOnly },
};

// ── conditionType → stage mapping ────────────────────────────────────

const CONDITION_TO_STAGE: Record<string, number> = {
  users: 2,
  applications: 3,
  platforms: 4,
  locations: 4,
  clientAppTypes: 4,
  signInRisk: 4,
  userRisk: 4,
  risk: 4,
  devices: 4,
};

// ── Policy classification ────────────────────────────────────────────

interface PolicyPath {
  policyId: string;
  path: string[]; // ordered node IDs
}

function classifyPolicy(
  policy: ConditionalAccessPolicy,
  evalResult: PolicyEvaluationResult | undefined,
): PolicyPath {
  const policyId = policy.id;

  // Disabled: All → Disabled
  if (policy.state === 'disabled') {
    return { policyId, path: ['stage-0-all', 'stage-1-disabled'] };
  }

  // Report-only: parallel track All → RO → RO-Users → RO-Apps → RO-Other → RO-Verdict
  if (policy.state === 'enabledForReportingButNotEnforced') {
    return {
      policyId,
      path: [
        'stage-0-all',
        'stage-1-report-only',
        'stage-2-ro-users',
        'stage-3-ro-apps',
        'stage-4-ro-other',
        'stage-5-report-only',
      ],
    };
  }

  // Enabled policy: check conditions
  if (!evalResult) {
    // No eval result (shouldn't happen post-eval, but safety)
    return { policyId, path: ['stage-0-all', 'stage-1-enabled'] };
  }

  // Find first failing condition
  const firstFailure = evalResult.conditionResults.find((cr) => !cr.matches);

  if (firstFailure) {
    const failStage = CONDITION_TO_STAGE[firstFailure.conditionType] ?? 4;

    // Build path up to the failure point
    const path = ['stage-0-all', 'stage-1-enabled'];
    if (failStage === 2) {
      path.push('stage-2-dropout-users');
    } else if (failStage === 3) {
      path.push('stage-2-users', 'stage-3-dropout-apps');
    } else {
      // failStage === 4
      path.push('stage-2-users', 'stage-3-apps', 'stage-4-dropout-other');
    }
    return { policyId, path };
  }

  // All conditions passed — determine verdict
  const path = [
    'stage-0-all',
    'stage-1-enabled',
    'stage-2-users',
    'stage-3-apps',
    'stage-4-other',
  ];

  if (evalResult.grantControls?.controls.includes('block')) {
    path.push('stage-5-block');
  } else if (evalResult.grantControls && !evalResult.grantControls.satisfied) {
    path.push('stage-5-controls');
  } else {
    path.push('stage-5-allow');
  }

  return { policyId, path };
}

// ── Main builder ─────────────────────────────────────────────────────

export function buildSankeyData(
  result: CAEngineResult | null,
  policies: ConditionalAccessPolicy[],
): SankeyData | null {
  if (!result || policies.length === 0) return null;

  // Classify every policy
  const paths: PolicyPath[] = policies.map((policy) => {
    const evalResult = findEvalResult(result, policy.id);
    return classifyPolicy(policy, evalResult);
  });

  // Accumulate nodes
  const nodeMap = new Map<string, { count: number; policies: string[] }>();
  for (const { policyId, path } of paths) {
    for (const nodeId of path) {
      const entry = nodeMap.get(nodeId);
      if (entry) {
        entry.count++;
        entry.policies.push(policyId);
      } else {
        nodeMap.set(nodeId, { count: 1, policies: [policyId] });
      }
    }
  }

  // Accumulate links
  const linkMap = new Map<string, { value: number; policies: string[]; type: FlowLink['type'] }>();
  for (const { policyId, path } of paths) {
    for (let i = 0; i < path.length - 1; i++) {
      const source = path[i];
      const target = path[i + 1];
      const key = `${source}|${target}`;
      const isDropout = NODE_DEFS[target]?.nodeType === 'dropout';
      const entry = linkMap.get(key);
      if (entry) {
        entry.value++;
        entry.policies.push(policyId);
      } else {
        linkMap.set(key, {
          value: 1,
          policies: [policyId],
          type: isDropout ? 'dropout' : 'flow',
        });
      }
    }
  }

  // Build nodes array (only those with count > 0)
  const nodes: FlowNode[] = [];
  for (const [nodeId, { count, policies: policyIds }] of nodeMap) {
    if (count === 0) continue;
    const def = NODE_DEFS[nodeId];
    if (!def) continue;
    nodes.push({
      id: def.id,
      label: def.label,
      count,
      stage: def.stage,
      nodeType: def.nodeType,
      color: def.color,
      policies: policyIds,
    });
  }

  // Build links array (only those with value > 0)
  const links: FlowLink[] = [];
  for (const [key, { value, policies: policyIds, type }] of linkMap) {
    if (value === 0) continue;
    const [source, target] = key.split('|');
    links.push({ source, target, value, policies: policyIds, type });
  }

  if (nodes.length < 2 || links.length === 0) return null;

  return { nodes, links };
}
