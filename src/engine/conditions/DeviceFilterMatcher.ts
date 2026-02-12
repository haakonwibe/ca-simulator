// engine/conditions/DeviceFilterMatcher.ts

import type { ConditionMatcher } from './ConditionMatcher';
import type { DeviceFilterCondition } from '../models/Policy';
import type { ConditionMatchResult } from '../models/EvaluationResult';
import type { SimulationContext } from '../models/SimulationContext';

/**
 * Resolves a device.{property} reference to a string value from the simulation context.
 *
 * Supports direct DeviceContext fields (isCompliant, trustType) and arbitrary
 * properties from context.device.properties.
 */
function resolveDeviceProperty(context: SimulationContext, propertyPath: string): string | undefined {
  // Strip the "device." prefix
  const prop = propertyPath.startsWith('device.') ? propertyPath.slice(7) : propertyPath;

  switch (prop) {
    case 'isCompliant':
      return context.device.isCompliant !== undefined ? String(context.device.isCompliant) : undefined;
    case 'trustType':
      return context.device.trustType;
    case 'platform':
      return context.device.platform;
    default:
      return context.device.properties?.[prop];
  }
}

/** Supported comparison operators */
type FilterOperator = 'eq' | 'ne' | 'startsWith' | 'contains' | 'notContains' | 'in';

interface ParsedExpression {
  property: string;
  operator: FilterOperator;
  value: string;
}

const OPERATOR_SET = new Set<string>(['eq', 'ne', 'startsWith', 'contains', 'notContains', 'in']);

/**
 * Regex to match a single filter expression:
 *   device.{property} -{operator} "value"   OR   device.{property} -{operator} value
 *
 * Captures:
 *   [1] = full property path (e.g. "device.model")
 *   [2] = operator name (e.g. "startsWith")
 *   [3] = quoted value (without quotes) — if present
 *   [4] = unquoted value — if no quotes
 */
const EXPRESSION_RE = /^(device\.\w+)\s+-(\w+)\s+(?:"([^"]*)"|(\S+))$/;

function parseExpression(expr: string): ParsedExpression | null {
  const match = expr.trim().match(EXPRESSION_RE);
  if (!match) {
    return null;
  }

  const property = match[1];
  const operator = match[2];
  const value = match[3] ?? match[4];

  if (!OPERATOR_SET.has(operator)) {
    return null;
  }

  return { property, operator: operator as FilterOperator, value };
}

function evaluateExpression(expr: ParsedExpression, context: SimulationContext): boolean {
  const actual = resolveDeviceProperty(context, expr.property);

  // Missing property → can't match
  if (actual === undefined) {
    return false;
  }

  const actualLower = actual.toLowerCase();
  const valueLower = expr.value.toLowerCase();

  switch (expr.operator) {
    case 'eq':
      return actualLower === valueLower;
    case 'ne':
      return actualLower !== valueLower;
    case 'startsWith':
      return actualLower.startsWith(valueLower);
    case 'contains':
      return actualLower.includes(valueLower);
    case 'notContains':
      return !actualLower.includes(valueLower);
    case 'in': {
      // Value is expected as a bracketed list: [val1, val2, val3]
      // or a simple comma-separated string
      const items = expr.value
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((s) => s.trim().replace(/^"|"$/g, '').toLowerCase());
      return items.includes(actualLower);
    }
    default:
      return false;
  }
}

/**
 * Evaluates a device filter rule string against device properties.
 *
 * Supports single expressions and compound expressions joined by -and.
 * Returns null if the rule cannot be parsed (caller should fail open).
 *
 * This function is a separate pure function so it can be replaced with a
 * proper AST parser in Phase 4 without changing the matcher's interface.
 */
export function evaluateFilterRule(rule: string, context: SimulationContext): boolean | null {
  // Split by -and (case-insensitive, with surrounding whitespace)
  const parts = rule.split(/\s+-and\s+/i);

  const expressions: ParsedExpression[] = [];
  for (const part of parts) {
    const parsed = parseExpression(part);
    if (!parsed) {
      // Unparseable expression → return null to signal parse failure
      return null;
    }
    expressions.push(parsed);
  }

  if (expressions.length === 0) {
    return null;
  }

  // All expressions must be true (AND logic)
  return expressions.every((expr) => evaluateExpression(expr, context));
}

/**
 * Evaluates the device filter condition of a Conditional Access policy.
 *
 * Mode logic (different from other matchers):
 * - mode: 'include' → rule=true means device IS targeted (policy applies)
 * - mode: 'exclude' → rule=true means device IS excluded (policy does NOT apply)
 *
 * Unparseable rules fail open: return matches=true so the policy isn't silently skipped.
 */
export class DeviceFilterMatcher implements ConditionMatcher<DeviceFilterCondition> {
  evaluate(context: SimulationContext, condition: DeviceFilterCondition): ConditionMatchResult {
    const ruleResult = evaluateFilterRule(condition.rule, context);

    // Parse failure → fail open
    if (ruleResult === null) {
      return {
        conditionType: 'devices',
        matches: true,
        reason: `Device filter rule could not be parsed — defaulting to match`,
        phase: 'inclusion',
        details: { parseError: true, rule: condition.rule },
      };
    }

    if (condition.mode === 'include') {
      // mode: 'include' → rule=true means the device is targeted → matches
      return {
        conditionType: 'devices',
        matches: ruleResult,
        reason: ruleResult
          ? `Device matches include filter: ${condition.rule}`
          : `Device does not match include filter: ${condition.rule}`,
        phase: 'inclusion',
        details: { mode: 'include', ruleResult, rule: condition.rule },
      };
    }

    // mode: 'exclude' → rule=true means the device is excluded → does NOT match
    return {
      conditionType: 'devices',
      matches: !ruleResult,
      reason: ruleResult
        ? `Device is excluded by filter: ${condition.rule}`
        : `Device is not excluded by filter: ${condition.rule}`,
      phase: ruleResult ? 'exclusion' : 'inclusion',
      details: { mode: 'exclude', ruleResult, rule: condition.rule },
    };
  }
}
