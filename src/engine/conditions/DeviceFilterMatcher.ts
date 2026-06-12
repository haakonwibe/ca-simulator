// engine/conditions/DeviceFilterMatcher.ts

import type { ConditionMatcher } from './ConditionMatcher';
import type { DeviceFilterCondition } from '../models/Policy';
import type { ConditionMatchResult } from '../models/EvaluationResult';
import type { SimulationContext } from '../models/SimulationContext';

/**
 * Maps DeviceContext.trustType values to the vocabulary used by the Entra
 * device filter grammar (e.g. `device.trustType -eq "ServerAD"`), which differs
 * from the join-type names used elsewhere in Graph.
 */
const TRUST_TYPE_FILTER_VALUES: Record<string, string> = {
  azureADJoined: 'AzureAD',
  hybridAzureADJoined: 'ServerAD',
  azureADRegistered: 'Workplace',
};

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
      return context.device.trustType ? TRUST_TYPE_FILTER_VALUES[context.device.trustType] : undefined;
    case 'platform':
      return context.device.platform;
    default:
      return context.device.properties?.[prop];
  }
}

/** Supported comparison operators (the full Entra device filter set) */
type FilterOperator =
  | 'eq' | 'ne'
  | 'startsWith' | 'notStartsWith'
  | 'endsWith' | 'notEndsWith'
  | 'contains' | 'notContains'
  | 'in' | 'notIn';

/** Lowercased operator name → canonical operator */
const OPERATOR_MAP: Record<string, FilterOperator> = {
  eq: 'eq',
  ne: 'ne',
  startswith: 'startsWith',
  notstartswith: 'notStartsWith',
  endswith: 'endsWith',
  notendswith: 'notEndsWith',
  contains: 'contains',
  notcontains: 'notContains',
  in: 'in',
  notin: 'notIn',
};

/**
 * Negative operators evaluate TRUE against a missing/null property.
 * This matches documented Entra behavior: unregistered devices have all
 * properties null, and Microsoft's guidance is to target them with negative
 * operators because the rule "would apply".
 */
const NEGATIVE_OPERATORS = new Set<FilterOperator>(['ne', 'notStartsWith', 'notEndsWith', 'notContains', 'notIn']);

type FilterNode =
  | { kind: 'and' | 'or'; children: FilterNode[] }
  | { kind: 'comparison'; property: string; operator: FilterOperator; value: string };

/**
 * Recursive-descent parser for the Entra device filter grammar:
 *
 *   rule       := orExpr
 *   orExpr     := andExpr (-or andExpr)*
 *   andExpr    := primary (-and primary)*        // -and binds tighter than -or
 *   primary    := '(' orExpr ')' | comparison
 *   comparison := device.{property} -{operator} value
 *   value      := "quoted" | [list] | bareword
 */
class FilterRuleParser {
  private pos = 0;

  constructor(private readonly input: string) {}

  /** Returns the parsed AST, or null if the rule has invalid syntax. */
  parse(): FilterNode | null {
    try {
      const node = this.parseOr();
      this.skipWhitespace();
      if (this.pos !== this.input.length) return null;
      return node;
    } catch {
      return null;
    }
  }

  private parseOr(): FilterNode {
    const children = [this.parseAnd()];
    while (this.tryConsumeKeyword('-or')) {
      children.push(this.parseAnd());
    }
    return children.length === 1 ? children[0] : { kind: 'or', children };
  }

  private parseAnd(): FilterNode {
    const children = [this.parsePrimary()];
    while (this.tryConsumeKeyword('-and')) {
      children.push(this.parsePrimary());
    }
    return children.length === 1 ? children[0] : { kind: 'and', children };
  }

  private parsePrimary(): FilterNode {
    this.skipWhitespace();
    if (this.input[this.pos] === '(') {
      this.pos++;
      const node = this.parseOr();
      this.skipWhitespace();
      if (this.input[this.pos] !== ')') throw new Error('Expected closing parenthesis');
      this.pos++;
      return node;
    }
    return this.parseComparison();
  }

  private parseComparison(): FilterNode {
    this.skipWhitespace();
    const propMatch = /^device\.\w+/.exec(this.input.slice(this.pos));
    if (!propMatch) throw new Error('Expected device.{property}');
    const property = propMatch[0];
    this.pos += property.length;

    this.skipWhitespace();
    const opMatch = /^-(\w+)/.exec(this.input.slice(this.pos));
    if (!opMatch) throw new Error('Expected -operator');
    const operator = OPERATOR_MAP[opMatch[1].toLowerCase()];
    if (!operator) throw new Error(`Unknown operator: ${opMatch[1]}`);
    this.pos += opMatch[0].length;

    const value = this.parseValue();
    return { kind: 'comparison', property, operator, value };
  }

  private parseValue(): string {
    this.skipWhitespace();
    const ch = this.input[this.pos];
    if (ch === '"') {
      const end = this.input.indexOf('"', this.pos + 1);
      if (end === -1) throw new Error('Unterminated quoted value');
      const value = this.input.slice(this.pos + 1, end);
      this.pos = end + 1;
      return value;
    }
    if (ch === '[') {
      // Bracketed list — may contain quoted items with spaces/commas
      const end = this.findListEnd(this.pos);
      const value = this.input.slice(this.pos, end + 1);
      this.pos = end + 1;
      return value;
    }
    // Bareword — runs to whitespace or a closing parenthesis
    const match = /^[^\s)]+/.exec(this.input.slice(this.pos));
    if (!match) throw new Error('Expected value');
    this.pos += match[0].length;
    return match[0];
  }

  private findListEnd(start: number): number {
    let inQuotes = false;
    for (let i = start + 1; i < this.input.length; i++) {
      const ch = this.input[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === ']' && !inQuotes) return i;
    }
    throw new Error('Unterminated list value');
  }

  private tryConsumeKeyword(keyword: string): boolean {
    this.skipWhitespace();
    const slice = this.input.slice(this.pos, this.pos + keyword.length);
    if (slice.toLowerCase() !== keyword) return false;
    // Keyword must be followed by whitespace or '(' (not part of a longer word)
    const next = this.input[this.pos + keyword.length];
    if (next !== undefined && !/[\s(]/.test(next)) return false;
    this.pos += keyword.length;
    return true;
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }
}

function parseListItems(value: string): string[] {
  return value
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim().replace(/^"|"$/g, '').toLowerCase())
    .filter((s) => s.length > 0);
}

function evaluateComparison(
  expr: { property: string; operator: FilterOperator; value: string },
  context: SimulationContext,
): boolean {
  const actual = resolveDeviceProperty(context, expr.property);

  // Missing/null property: negative operators match (documented Entra behavior
  // for unregistered devices), positive operators don't.
  if (actual === undefined) {
    return NEGATIVE_OPERATORS.has(expr.operator);
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
    case 'notStartsWith':
      return !actualLower.startsWith(valueLower);
    case 'endsWith':
      return actualLower.endsWith(valueLower);
    case 'notEndsWith':
      return !actualLower.endsWith(valueLower);
    case 'contains':
      return actualLower.includes(valueLower);
    case 'notContains':
      return !actualLower.includes(valueLower);
    case 'in':
      return parseListItems(expr.value).includes(actualLower);
    case 'notIn':
      return !parseListItems(expr.value).includes(actualLower);
  }
}

function evaluateNode(node: FilterNode, context: SimulationContext): boolean {
  switch (node.kind) {
    case 'and':
      return node.children.every((child) => evaluateNode(child, context));
    case 'or':
      return node.children.some((child) => evaluateNode(child, context));
    case 'comparison':
      return evaluateComparison(node, context);
  }
}

/**
 * Evaluates a device filter rule string against device properties.
 *
 * Supports the full Entra grammar: parenthesized expressions, -and/-or chains
 * (-and binds tighter), and all ten comparison operators.
 * Returns null if the rule cannot be parsed (caller should fail open).
 */
export function evaluateFilterRule(rule: string, context: SimulationContext): boolean | null {
  const ast = new FilterRuleParser(rule).parse();
  if (!ast) {
    return null;
  }
  return evaluateNode(ast, context);
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
