// DeviceFilterMatcher tests

import { describe, it, expect } from 'vitest';
import { DeviceFilterMatcher, evaluateFilterRule } from '../../conditions/DeviceFilterMatcher';
import { createTestContext } from '../fixtures/testScenarios';
import type { DeviceFilterCondition } from '../../models/Policy';

const matcher = new DeviceFilterMatcher();

function deviceContext(properties: Record<string, string>, extra?: { isCompliant?: boolean; trustType?: string }) {
  return createTestContext({
    device: {
      properties,
      isCompliant: extra?.isCompliant,
      trustType: extra?.trustType as 'azureADJoined' | 'hybridAzureADJoined' | 'azureADRegistered' | undefined,
    },
  });
}

function includeFilter(rule: string): DeviceFilterCondition {
  return { mode: 'include', rule };
}

function excludeFilter(rule: string): DeviceFilterCondition {
  return { mode: 'exclude', rule };
}

describe('DeviceFilterMatcher', () => {
  // ──────────────────────────────────────────────
  // Simple -eq expression
  // ──────────────────────────────────────────────
  describe('-eq operator', () => {
    it('matches when device.model equals the value', () => {
      const ctx = deviceContext({ model: 'Surface Pro' });
      const result = matcher.evaluate(ctx, includeFilter('device.model -eq "Surface Pro"'));

      expect(result.matches).toBe(true);
    });

    it('does not match when device.model differs', () => {
      const ctx = deviceContext({ model: 'ThinkPad X1' });
      const result = matcher.evaluate(ctx, includeFilter('device.model -eq "Surface Pro"'));

      expect(result.matches).toBe(false);
    });

    it('is case-insensitive', () => {
      const ctx = deviceContext({ model: 'surface pro' });
      const result = matcher.evaluate(ctx, includeFilter('device.model -eq "Surface Pro"'));

      expect(result.matches).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // -startsWith operator
  // ──────────────────────────────────────────────
  describe('-startsWith operator', () => {
    it('matches when value starts with the prefix', () => {
      const ctx = deviceContext({ model: 'Surface Pro 9' });
      const result = matcher.evaluate(ctx, includeFilter('device.model -startsWith "Surface"'));

      expect(result.matches).toBe(true);
    });

    it('does not match when value does not start with the prefix', () => {
      const ctx = deviceContext({ model: 'ThinkPad X1' });
      const result = matcher.evaluate(ctx, includeFilter('device.model -startsWith "Surface"'));

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // -contains operator
  // ──────────────────────────────────────────────
  describe('-contains operator', () => {
    it('matches when value contains the substring', () => {
      const ctx = deviceContext({ operatingSystem: 'Windows 11 Enterprise' });
      const result = matcher.evaluate(ctx, includeFilter('device.operatingSystem -contains "Windows"'));

      expect(result.matches).toBe(true);
    });

    it('does not match when value does not contain the substring', () => {
      const ctx = deviceContext({ operatingSystem: 'macOS Ventura' });
      const result = matcher.evaluate(ctx, includeFilter('device.operatingSystem -contains "Windows"'));

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // -ne operator
  // ──────────────────────────────────────────────
  describe('-ne operator', () => {
    it('matches when value does not equal', () => {
      const ctx = deviceContext({ manufacturer: 'Lenovo' });
      const result = matcher.evaluate(ctx, includeFilter('device.manufacturer -ne "Microsoft"'));

      expect(result.matches).toBe(true);
    });

    it('does not match when value equals', () => {
      const ctx = deviceContext({ manufacturer: 'Microsoft' });
      const result = matcher.evaluate(ctx, includeFilter('device.manufacturer -ne "Microsoft"'));

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // -notContains operator
  // ──────────────────────────────────────────────
  describe('-notContains operator', () => {
    it('matches when value does not contain the substring', () => {
      const ctx = deviceContext({ operatingSystem: 'macOS Ventura' });
      const result = matcher.evaluate(ctx, includeFilter('device.operatingSystem -notContains "Windows"'));

      expect(result.matches).toBe(true);
    });

    it('does not match when value contains the substring', () => {
      const ctx = deviceContext({ operatingSystem: 'Windows 11' });
      const result = matcher.evaluate(ctx, includeFilter('device.operatingSystem -notContains "Windows"'));

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Compound -and expressions
  // ──────────────────────────────────────────────
  describe('compound -and expressions', () => {
    const rule = 'device.model -startsWith "Surface" -and device.isCompliant -eq "true"';

    it('matches when both conditions are true', () => {
      const ctx = deviceContext({ model: 'Surface Pro 9' }, { isCompliant: true });
      const result = matcher.evaluate(ctx, includeFilter(rule));

      expect(result.matches).toBe(true);
    });

    it('does not match when first condition fails', () => {
      const ctx = deviceContext({ model: 'ThinkPad X1' }, { isCompliant: true });
      const result = matcher.evaluate(ctx, includeFilter(rule));

      expect(result.matches).toBe(false);
    });

    it('does not match when second condition fails', () => {
      const ctx = deviceContext({ model: 'Surface Pro 9' }, { isCompliant: false });
      const result = matcher.evaluate(ctx, includeFilter(rule));

      expect(result.matches).toBe(false);
    });

    it('does not match when both conditions fail', () => {
      const ctx = deviceContext({ model: 'ThinkPad' }, { isCompliant: false });
      const result = matcher.evaluate(ctx, includeFilter(rule));

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Mode: 'include'
  // ──────────────────────────────────────────────
  describe('mode: include', () => {
    it('rule true → matches (device is targeted)', () => {
      const ctx = deviceContext({ model: 'Surface Pro' });
      const result = matcher.evaluate(ctx, includeFilter('device.model -eq "Surface Pro"'));

      expect(result.matches).toBe(true);
      expect(result.details?.mode).toBe('include');
      expect(result.details?.ruleResult).toBe(true);
    });

    it('rule false → does not match (device is not targeted)', () => {
      const ctx = deviceContext({ model: 'ThinkPad' });
      const result = matcher.evaluate(ctx, includeFilter('device.model -eq "Surface Pro"'));

      expect(result.matches).toBe(false);
      expect(result.details?.mode).toBe('include');
      expect(result.details?.ruleResult).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Mode: 'exclude'
  // ──────────────────────────────────────────────
  describe('mode: exclude', () => {
    it('rule true → excluded (does not match)', () => {
      const ctx = deviceContext({ model: 'Surface Pro' });
      const result = matcher.evaluate(ctx, excludeFilter('device.model -eq "Surface Pro"'));

      expect(result.matches).toBe(false);
      expect(result.phase).toBe('exclusion');
      expect(result.details?.mode).toBe('exclude');
      expect(result.details?.ruleResult).toBe(true);
    });

    it('rule false → not excluded (matches)', () => {
      const ctx = deviceContext({ model: 'ThinkPad' });
      const result = matcher.evaluate(ctx, excludeFilter('device.model -eq "Surface Pro"'));

      expect(result.matches).toBe(true);
      expect(result.phase).toBe('inclusion');
      expect(result.details?.mode).toBe('exclude');
      expect(result.details?.ruleResult).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Parenthesized expressions (canonical doc syntax)
  // ──────────────────────────────────────────────
  describe('parenthesized expressions', () => {
    it('parses a single parenthesized expression', () => {
      const ctx = deviceContext({}, { trustType: 'hybridAzureADJoined' });
      const result = matcher.evaluate(ctx, includeFilter('(device.trustType -eq "ServerAD")'));

      expect(result.matches).toBe(true);
      expect(result.details?.parseError).toBeUndefined();
    });

    it('parses parenthesized expressions joined by -and', () => {
      const ctx = deviceContext({ model: 'Surface Pro', manufacturer: 'Microsoft' });
      const rule = '(device.manufacturer -eq "Microsoft") -and (device.model -startsWith "Surface")';

      expect(matcher.evaluate(ctx, includeFilter(rule)).matches).toBe(true);
    });

    it('parses nested grouping with -and/-or precedence (-and binds tighter)', () => {
      // a -or b -and c  ≡  a -or (b -and c)
      const rule = 'device.model -eq "iPhone" -or device.manufacturer -eq "Microsoft" -and device.model -eq "Surface"';

      expect(matcher.evaluate(deviceContext({ model: 'iPhone' }), includeFilter(rule)).matches).toBe(true);
      expect(matcher.evaluate(deviceContext({ model: 'Surface', manufacturer: 'Microsoft' }), includeFilter(rule)).matches).toBe(true);
      expect(matcher.evaluate(deviceContext({ model: 'Surface', manufacturer: 'Apple' }), includeFilter(rule)).matches).toBe(false);
    });

    it('explicit grouping overrides precedence', () => {
      // (a -or b) -and c
      const rule = '(device.model -eq "iPhone" -or device.model -eq "Surface") -and device.manufacturer -eq "Microsoft"';

      expect(matcher.evaluate(deviceContext({ model: 'iPhone', manufacturer: 'Apple' }), includeFilter(rule)).matches).toBe(false);
      expect(matcher.evaluate(deviceContext({ model: 'Surface', manufacturer: 'Microsoft' }), includeFilter(rule)).matches).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // -or chains
  // ──────────────────────────────────────────────
  describe('-or expressions', () => {
    it('matches when any branch is true', () => {
      const ctx = deviceContext({ model: 'MacBook' });
      const rule = 'device.model -eq "Surface" -or device.model -eq "MacBook"';

      expect(matcher.evaluate(ctx, includeFilter(rule)).matches).toBe(true);
    });

    it('does not match when no branch is true', () => {
      const ctx = deviceContext({ model: 'ThinkPad' });
      const rule = 'device.model -eq "Surface" -or device.model -eq "MacBook"';

      expect(matcher.evaluate(ctx, includeFilter(rule)).matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Extended operator set
  // ──────────────────────────────────────────────
  describe('extended operators', () => {
    it('-endsWith and -notEndsWith', () => {
      const ctx = deviceContext({ displayName: 'LAPTOP-SALES-01' });

      expect(matcher.evaluate(ctx, includeFilter('device.displayName -endsWith "01"')).matches).toBe(true);
      expect(matcher.evaluate(ctx, includeFilter('device.displayName -notEndsWith "01"')).matches).toBe(false);
    });

    it('-notStartsWith', () => {
      const ctx = deviceContext({ displayName: 'LAPTOP-SALES-01' });

      expect(matcher.evaluate(ctx, includeFilter('device.displayName -notStartsWith "DESKTOP"')).matches).toBe(true);
      expect(matcher.evaluate(ctx, includeFilter('device.displayName -notStartsWith "LAPTOP"')).matches).toBe(false);
    });

    it('-notIn with a bracketed list', () => {
      const ctx = deviceContext({ model: 'ThinkPad' });

      expect(matcher.evaluate(ctx, includeFilter('device.model -notIn ["Surface", "MacBook"]')).matches).toBe(true);
      expect(matcher.evaluate(ctx, includeFilter('device.model -notIn ["ThinkPad", "MacBook"]')).matches).toBe(false);
    });

    it('-in list items containing spaces', () => {
      const ctx = deviceContext({ model: 'Surface Pro 9' });

      expect(matcher.evaluate(ctx, includeFilter('device.model -in ["Surface Pro 9", "Surface Laptop"]')).matches).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Missing properties — negative operators match
  // ──────────────────────────────────────────────
  describe('missing properties with negative operators', () => {
    it('-ne matches a device without the property (unregistered device targeting)', () => {
      const ctx = deviceContext({});

      expect(matcher.evaluate(ctx, includeFilter('device.model -ne "Surface"')).matches).toBe(true);
    });

    it('-notContains and -notIn match a device without the property', () => {
      const ctx = deviceContext({});

      expect(matcher.evaluate(ctx, includeFilter('device.model -notContains "Surface"')).matches).toBe(true);
      expect(matcher.evaluate(ctx, includeFilter('device.model -notIn ["Surface"]')).matches).toBe(true);
    });

    it('positive operators still do not match a missing property', () => {
      const ctx = deviceContext({});

      expect(matcher.evaluate(ctx, includeFilter('device.model -eq "Surface"')).matches).toBe(false);
      expect(matcher.evaluate(ctx, includeFilter('device.model -contains "Surface"')).matches).toBe(false);
    });

    it('exclude-mode -ne filter excludes an unregistered device', () => {
      const ctx = deviceContext({});
      const result = matcher.evaluate(ctx, excludeFilter('device.model -ne "Surface"'));

      expect(result.matches).toBe(false);
      expect(result.phase).toBe('exclusion');
    });
  });

  // ──────────────────────────────────────────────
  // Unparseable rules — fail open
  // ──────────────────────────────────────────────
  describe('unparseable rules', () => {
    it('fails open with parseError flag', () => {
      const ctx = deviceContext({ model: 'Surface' });
      const result = matcher.evaluate(ctx, includeFilter('this is not a valid rule'));

      expect(result.matches).toBe(true);
      expect(result.details?.parseError).toBe(true);
      expect(result.reason).toContain('could not be parsed');
    });

    it('fails open on unknown operator', () => {
      const ctx = deviceContext({ model: 'Surface' });
      const result = matcher.evaluate(ctx, includeFilter('device.model -foobar "Surface"'));

      expect(result.matches).toBe(true);
      expect(result.details?.parseError).toBe(true);
    });

    it('fails open on empty rule string', () => {
      const ctx = deviceContext({ model: 'Surface' });
      const result = matcher.evaluate(ctx, includeFilter(''));

      expect(result.matches).toBe(true);
      expect(result.details?.parseError).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Missing device property
  // ──────────────────────────────────────────────
  describe('missing device property', () => {
    it('expression evaluates to false when property is not present', () => {
      const ctx = deviceContext({}); // no properties
      const result = matcher.evaluate(ctx, includeFilter('device.model -eq "Surface"'));

      expect(result.matches).toBe(false);
    });

    it('compound expression fails if any property is missing', () => {
      const ctx = deviceContext({ model: 'Surface Pro' }); // no isCompliant
      const rule = 'device.model -startsWith "Surface" -and device.isCompliant -eq "true"';
      const result = matcher.evaluate(ctx, includeFilter(rule));

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Direct DeviceContext fields
  // ──────────────────────────────────────────────
  describe('direct DeviceContext field resolution', () => {
    it('resolves device.isCompliant from DeviceContext', () => {
      const ctx = deviceContext({}, { isCompliant: true });
      const result = matcher.evaluate(ctx, includeFilter('device.isCompliant -eq "true"'));

      expect(result.matches).toBe(true);
    });

    it('maps device.trustType to the Entra filter grammar vocabulary', () => {
      // Filter rules use AzureAD/ServerAD/Workplace, not the join-type names
      const azureAdJoined = deviceContext({}, { trustType: 'azureADJoined' });
      expect(matcher.evaluate(azureAdJoined, includeFilter('device.trustType -eq "AzureAD"')).matches).toBe(true);

      const hybridJoined = deviceContext({}, { trustType: 'hybridAzureADJoined' });
      expect(matcher.evaluate(hybridJoined, includeFilter('device.trustType -eq "ServerAD"')).matches).toBe(true);
      expect(matcher.evaluate(hybridJoined, includeFilter('device.trustType -eq "AzureAD"')).matches).toBe(false);

      const registered = deviceContext({}, { trustType: 'azureADRegistered' });
      expect(matcher.evaluate(registered, includeFilter('device.trustType -eq "Workplace"')).matches).toBe(true);
    });

    it('does not match join-type names in trustType rules', () => {
      const ctx = deviceContext({}, { trustType: 'azureADJoined' });
      const result = matcher.evaluate(ctx, includeFilter('device.trustType -eq "azureADJoined"'));

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // evaluateFilterRule pure function
  // ──────────────────────────────────────────────
  describe('evaluateFilterRule (pure function)', () => {
    it('returns boolean for valid rules', () => {
      const ctx = deviceContext({ model: 'Surface' });
      expect(evaluateFilterRule('device.model -eq "Surface"', ctx)).toBe(true);
      expect(evaluateFilterRule('device.model -eq "ThinkPad"', ctx)).toBe(false);
    });

    it('returns null for unparseable rules', () => {
      const ctx = deviceContext({ model: 'Surface' });
      expect(evaluateFilterRule('gibberish', ctx)).toBe(null);
    });
  });

  // ──────────────────────────────────────────────
  // Trace quality
  // ──────────────────────────────────────────────
  describe('trace quality', () => {
    it('always returns conditionType "devices"', () => {
      const ctx = deviceContext({ model: 'Surface' });
      const result = matcher.evaluate(ctx, includeFilter('device.model -eq "Surface"'));

      expect(result.conditionType).toBe('devices');
    });

    it('includes the rule in details', () => {
      const ctx = deviceContext({ model: 'Surface' });
      const rule = 'device.model -eq "Surface"';
      const result = matcher.evaluate(ctx, includeFilter(rule));

      expect(result.details?.rule).toBe(rule);
    });
  });
});
