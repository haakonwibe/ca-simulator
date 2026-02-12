// lib/__tests__/gapAnalysis.test.ts — Coverage gap analysis tests.

import { describe, it, expect } from 'vitest';
import { analyzeGaps, groupGaps, detectDisagreement, getSweepScenarioCount } from '../gapAnalysis';
import type { GapResult } from '../gapAnalysis';
import type { ConditionalAccessPolicy, PolicyConditions } from '@/engine/models/Policy';
import type { UserContext } from '@/engine/models/SimulationContext';

// ── Helpers ──

function createBaseConditions(overrides?: Partial<PolicyConditions>): PolicyConditions {
  return {
    users: {
      includeUsers: ['All'],
      excludeUsers: [],
      includeGroups: [],
      excludeGroups: [],
      includeRoles: [],
      excludeRoles: [],
    },
    applications: {
      includeApplications: ['All'],
      excludeApplications: [],
    },
    clientAppTypes: [],
    signInRiskLevels: [],
    userRiskLevels: [],
    ...overrides,
  };
}

function createPolicy(overrides?: Partial<ConditionalAccessPolicy>): ConditionalAccessPolicy {
  return {
    id: 'test-policy',
    displayName: 'Test Policy',
    state: 'enabled',
    conditions: createBaseConditions(),
    grantControls: null,
    sessionControls: null,
    ...overrides,
  };
}

// Per-user scenario combinations: 3 apps × 5 platforms × 4 clients × 2 locations × 4 signInRisk × 4 userRisk = 1,920
const PER_USER_SCENARIOS = 1920;
// Total expected scenario combinations (3 generic users): 3 × 1,920 = 5,760
const TOTAL_SCENARIOS = 5760;
// Legacy client types (exchangeActiveSync, other) = 2 of 4 client types = half of total
const LEGACY_SCENARIOS = TOTAL_SCENARIOS / 2;

describe('analyzeGaps', () => {
  // ── Core logic tests ──

  describe('empty policy set', () => {
    it('returns all 2,880 scenarios as critical no-policy gaps', () => {
      const gaps = analyzeGaps([]);
      expect(gaps.length).toBe(TOTAL_SCENARIOS);
      expect(gaps.every((g) => g.severity === 'critical')).toBe(true);
      expect(gaps.every((g) => g.gapType === 'no-policy')).toBe(true);
    });

    it('all gaps have reason about no policies', () => {
      const gaps = analyzeGaps([]);
      expect(gaps.every((g) => g.reason.includes('No policies apply'))).toBe(true);
    });

    it('default persona source is generic', () => {
      const gaps = analyzeGaps([]);
      expect(gaps[0].personaSource).toBe('generic');
      expect(gaps[0].personaName).toBeDefined();
    });
  });

  describe('single policy requiring MFA for All Users + All Apps', () => {
    it('produces no critical gaps and no MFA gaps, but device compliance warnings', () => {
      const policy = createPolicy({
        id: 'require-mfa',
        displayName: 'Require MFA for All',
        grantControls: {
          operator: 'OR',
          builtInControls: ['mfa'],
        },
      });

      const gaps = analyzeGaps([policy]);
      const criticalGaps = gaps.filter((g) => g.severity === 'critical');
      const noMfaGaps = gaps.filter((g) => g.gapType === 'no-mfa');
      const noDeviceGaps = gaps.filter((g) => g.gapType === 'no-device-compliance');

      expect(criticalGaps.length).toBe(0);
      expect(noMfaGaps.length).toBe(0);
      // MFA present but compliantDevice missing → device compliance warnings
      expect(noDeviceGaps.length).toBe(TOTAL_SCENARIOS);
    });
  });

  describe('policy targeting only admins', () => {
    it('members and guests show critical gaps', () => {
      const policy = createPolicy({
        id: 'admin-mfa',
        displayName: 'Require MFA for Admins',
        conditions: createBaseConditions({
          users: {
            includeUsers: [],
            excludeUsers: [],
            includeGroups: [],
            excludeGroups: [],
            includeRoles: ['62e90394-69f5-4237-9190-012177145e10'], // Global Admin
            excludeRoles: [],
          },
        }),
        grantControls: {
          operator: 'OR',
          builtInControls: ['mfa'],
        },
      });

      const gaps = analyzeGaps([policy]);
      const criticalGaps = gaps.filter((g) => g.severity === 'critical');

      const memberGaps = criticalGaps.filter((g) => g.userType === 'Standard Member');
      const guestGaps = criticalGaps.filter((g) => g.userType === 'Guest User');
      const adminGaps = criticalGaps.filter((g) => g.userType === 'Global Administrator');

      expect(memberGaps.length).toBeGreaterThan(0);
      expect(guestGaps.length).toBeGreaterThan(0);
      expect(adminGaps.length).toBe(0);
    });
  });

  describe('policy targeting only Office 365', () => {
    it('Admin Portals show gaps but All Cloud Apps and O365 do not', () => {
      const policy = createPolicy({
        id: 'o365-mfa',
        displayName: 'Require MFA for O365',
        conditions: createBaseConditions({
          applications: {
            includeApplications: ['Office365'],
            excludeApplications: [],
          },
        }),
        grantControls: {
          operator: 'OR',
          builtInControls: ['mfa'],
        },
      });

      const gaps = analyzeGaps([policy]);
      const criticalGaps = gaps.filter((g) => g.severity === 'critical');

      const adminPortalGaps = criticalGaps.filter((g) => g.application === 'Microsoft Admin Portals');
      const o365Gaps = criticalGaps.filter((g) => g.application === 'Office 365');
      const allAppsGaps = criticalGaps.filter((g) => g.application === 'All Cloud Apps');

      expect(adminPortalGaps.length).toBeGreaterThan(0);
      expect(o365Gaps.length).toBe(0);
      expect(allAppsGaps.length).toBe(0);
    });
  });

  describe('policy targeting only Windows and macOS', () => {
    it('iOS, Android, Linux show gaps', () => {
      const policy = createPolicy({
        id: 'desktop-mfa',
        displayName: 'Require MFA for Desktop',
        conditions: createBaseConditions({
          platforms: {
            includePlatforms: ['windows', 'macOS'],
          },
        }),
        grantControls: {
          operator: 'OR',
          builtInControls: ['mfa'],
        },
      });

      const gaps = analyzeGaps([policy]);
      const criticalGaps = gaps.filter((g) => g.severity === 'critical');

      const platformsWithGaps = new Set(criticalGaps.map((g) => g.platform));
      expect(platformsWithGaps.has('iOS')).toBe(true);
      expect(platformsWithGaps.has('android')).toBe(true);
      expect(platformsWithGaps.has('linux')).toBe(true);
      expect(platformsWithGaps.has('windows')).toBe(false);
      expect(platformsWithGaps.has('macOS')).toBe(false);
    });
  });

  describe('report-only policy', () => {
    it('classifies covered scenarios as info with report-only gapType', () => {
      const policy = createPolicy({
        id: 'report-only-mfa',
        displayName: 'Report-Only MFA',
        state: 'enabledForReportingButNotEnforced',
        grantControls: {
          operator: 'OR',
          builtInControls: ['mfa'],
        },
      });

      const gaps = analyzeGaps([policy]);
      const infoGaps = gaps.filter((g) => g.severity === 'info');
      const criticalGaps = gaps.filter((g) => g.severity === 'critical');

      expect(infoGaps.length).toBe(TOTAL_SCENARIOS);
      expect(infoGaps.every((g) => g.gapType === 'report-only')).toBe(true);
      expect(criticalGaps.length).toBe(0);
    });
  });

  describe('block policy', () => {
    it('blocked scenarios are not gaps', () => {
      const policy = createPolicy({
        id: 'block-all',
        displayName: 'Block Everything',
        grantControls: {
          operator: 'OR',
          builtInControls: ['block'],
        },
      });

      const gaps = analyzeGaps([policy]);
      expect(gaps.length).toBe(0);
    });
  });

  describe('sorted output', () => {
    it('critical < warning < caution < info in sort order', () => {
      const policies = [
        createPolicy({
          id: 'admin-mfa',
          displayName: 'Admin MFA',
          conditions: createBaseConditions({
            users: {
              includeUsers: [],
              excludeUsers: [],
              includeGroups: [],
              excludeGroups: [],
              includeRoles: ['62e90394-69f5-4237-9190-012177145e10'],
              excludeRoles: [],
            },
          }),
          grantControls: { operator: 'OR', builtInControls: ['mfa'] },
        }),
      ];

      const gaps = analyzeGaps(policies);
      const severities = gaps.map((g) => g.severity);
      const lastCriticalIdx = severities.lastIndexOf('critical');
      const firstWarningIdx = severities.indexOf('warning');
      const firstCautionIdx = severities.indexOf('caution');
      const firstInfoIdx = severities.indexOf('info');

      if (lastCriticalIdx >= 0 && firstWarningIdx >= 0) {
        expect(lastCriticalIdx).toBeLessThan(firstWarningIdx);
      }
      if (firstWarningIdx >= 0 && firstCautionIdx >= 0) {
        expect(severities.lastIndexOf('warning')).toBeLessThan(firstCautionIdx);
      }
      if (firstCautionIdx >= 0 && firstInfoIdx >= 0) {
        expect(severities.lastIndexOf('caution')).toBeLessThan(firstInfoIdx);
      }
    });
  });

  // ── Multi-classification tests ──

  describe('multi-classification per scenario', () => {
    it('session-only policy produces no-mfa + no-device-compliance + no-mfa-or-device', () => {
      const policy = createPolicy({
        id: 'session-only',
        displayName: 'Session Only',
        grantControls: null,
        sessionControls: {
          signInFrequency: { isEnabled: true, value: 1, type: 'hours', frequencyInterval: 'everyTime' },
        },
      });

      const gaps = analyzeGaps([policy]);
      const noMfaGaps = gaps.filter((g) => g.gapType === 'no-mfa');
      const noDeviceGaps = gaps.filter((g) => g.gapType === 'no-device-compliance');
      const cautionGaps = gaps.filter((g) => g.gapType === 'no-mfa-or-device');

      expect(noMfaGaps.length).toBe(TOTAL_SCENARIOS);
      expect(noDeviceGaps.length).toBe(TOTAL_SCENARIOS);
      expect(cautionGaps.length).toBe(TOTAL_SCENARIOS);
      // Total: 3 gap entries per non-legacy scenario + 4 per legacy scenario
      expect(gaps.length).toBe(TOTAL_SCENARIOS * 3 + LEGACY_SCENARIOS);
    });

    it('MFA-only policy produces no-device-compliance warning but no MFA warning or caution', () => {
      const policy = createPolicy({
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      });

      const gaps = analyzeGaps([policy]);
      const noMfaGaps = gaps.filter((g) => g.gapType === 'no-mfa');
      const noDeviceGaps = gaps.filter((g) => g.gapType === 'no-device-compliance');
      const cautionGaps = gaps.filter((g) => g.gapType === 'no-mfa-or-device');

      expect(noMfaGaps.length).toBe(0);
      expect(noDeviceGaps.length).toBe(TOTAL_SCENARIOS);
      expect(cautionGaps.length).toBe(0);
    });

    it('device compliance-only policy produces no-mfa warning but no device warning or caution', () => {
      const policy = createPolicy({
        grantControls: { operator: 'OR', builtInControls: ['compliantDevice'] },
      });

      const gaps = analyzeGaps([policy]);
      const noMfaGaps = gaps.filter((g) => g.gapType === 'no-mfa');
      const noDeviceGaps = gaps.filter((g) => g.gapType === 'no-device-compliance');
      const cautionGaps = gaps.filter((g) => g.gapType === 'no-mfa-or-device');

      expect(noMfaGaps.length).toBe(TOTAL_SCENARIOS);
      expect(noDeviceGaps.length).toBe(0);
      expect(cautionGaps.length).toBe(0);
    });

    it('policy requiring both MFA and compliantDevice produces only legacy gaps', () => {
      const policy = createPolicy({
        grantControls: { operator: 'AND', builtInControls: ['mfa', 'compliantDevice'] },
      });

      const gaps = analyzeGaps([policy]);
      // Non-legacy clients: fully covered (0 gaps). Legacy clients: legacy-auth-not-blocked only.
      expect(gaps.length).toBe(LEGACY_SCENARIOS);
      expect(gaps.every((g) => g.gapType === 'legacy-auth-not-blocked')).toBe(true);
    });

    it('critical (no-policy) scenarios do NOT also get MFA/device warnings', () => {
      const policy = createPolicy({
        conditions: createBaseConditions({
          users: {
            includeUsers: [],
            excludeUsers: [],
            includeGroups: [],
            excludeGroups: [],
            includeRoles: ['62e90394-69f5-4237-9190-012177145e10'],
            excludeRoles: [],
          },
        }),
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      });

      const gaps = analyzeGaps([policy]);
      const memberGaps = gaps.filter((g) => g.userType === 'Standard Member');
      const memberGapTypes = new Set(memberGaps.map((g) => g.gapType));

      expect(memberGapTypes.has('no-policy')).toBe(true);
      expect(memberGapTypes.has('no-mfa')).toBe(false);
      expect(memberGapTypes.has('no-device-compliance')).toBe(false);
      expect(memberGapTypes.has('no-mfa-or-device')).toBe(false);
    });

    it('block verdict produces zero gap results', () => {
      const policy = createPolicy({
        grantControls: { operator: 'OR', builtInControls: ['block'] },
      });

      const gaps = analyzeGaps([policy]);
      expect(gaps.length).toBe(0);
    });

    it('report-only policy requiring MFA is still classified as info', () => {
      const policy = createPolicy({
        state: 'enabledForReportingButNotEnforced',
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      });

      const gaps = analyzeGaps([policy]);
      expect(gaps.every((g) => g.severity === 'info')).toBe(true);
      expect(gaps.every((g) => g.gapType === 'report-only')).toBe(true);
    });
  });

  describe('gapType validation', () => {
    it('every gap result has a valid gapType', () => {
      const gaps = analyzeGaps([]);
      const validTypes = new Set(['no-policy', 'no-mfa', 'no-device-compliance', 'no-mfa-or-device', 'legacy-auth-not-blocked', 'report-only']);
      expect(gaps.every((g) => validTypes.has(g.gapType))).toBe(true);
    });
  });

  // ── Persona source tests ──

  describe('selected user mode', () => {
    it('sweeps 960 scenarios for a single real user', () => {
      const user: UserContext = {
        id: 'real-user',
        displayName: 'Test User',
        userType: 'member',
        memberOfGroupIds: ['some-group'],
        directoryRoleIds: [],
      };

      const gaps = analyzeGaps([], { personaSource: 'selected', selectedUser: user });
      expect(gaps.length).toBe(PER_USER_SCENARIOS);
      expect(gaps.every((g) => g.personaSource === 'selected')).toBe(true);
      expect(gaps.every((g) => g.personaName === 'Test User')).toBe(true);
    });

    it('user excluded from policy via group shows critical gaps', () => {
      const user: UserContext = {
        id: 'excluded-user',
        displayName: 'Excluded User',
        userType: 'member',
        memberOfGroupIds: ['excluded-group'],
        directoryRoleIds: [],
      };
      const policy = createPolicy({
        conditions: createBaseConditions({
          users: {
            includeUsers: ['All'],
            excludeUsers: [],
            includeGroups: [],
            excludeGroups: ['excluded-group'],
            includeRoles: [],
            excludeRoles: [],
          },
        }),
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      });

      // Generic: synthetic users not in group, policy applies → no critical gaps
      const genericGaps = analyzeGaps([policy]);
      const genericCritical = genericGaps.filter((g) => g.severity === 'critical');
      expect(genericCritical.length).toBe(0);

      // Selected: user IS in excluded group → policy doesn't apply → critical gaps
      const realGaps = analyzeGaps([policy], { personaSource: 'selected', selectedUser: user });
      const realCritical = realGaps.filter((g) => g.severity === 'critical');
      expect(realCritical.length).toBeGreaterThan(0);
      expect(realCritical.every((g) => g.personaName === 'Excluded User')).toBe(true);
    });

    it('admin with real role assignments matches role-targeted policies', () => {
      const admin: UserContext = {
        id: 'real-admin',
        displayName: 'Real Admin',
        userType: 'member',
        memberOfGroupIds: [],
        directoryRoleIds: ['62e90394-69f5-4237-9190-012177145e10'],
      };
      const policy = createPolicy({
        conditions: createBaseConditions({
          users: {
            includeUsers: [],
            excludeUsers: [],
            includeGroups: [],
            excludeGroups: [],
            includeRoles: ['62e90394-69f5-4237-9190-012177145e10'],
            excludeRoles: [],
          },
        }),
        grantControls: { operator: 'OR', builtInControls: ['mfa'] },
      });

      const gaps = analyzeGaps([policy], { personaSource: 'selected', selectedUser: admin });
      // Policy applies to admin → no critical gaps (only device compliance warnings)
      const criticalGaps = gaps.filter((g) => g.severity === 'critical');
      expect(criticalGaps.length).toBe(0);
    });

    it('falls back to generic when no selectedUser provided', () => {
      const gaps = analyzeGaps([], { personaSource: 'selected' });
      expect(gaps.length).toBe(TOTAL_SCENARIOS);
      expect(gaps[0].personaSource).toBe('generic');
    });
  });

  describe('resolved users mode', () => {
    it('sweeps multiple users independently', () => {
      const users: UserContext[] = [
        { id: 'u1', displayName: 'Alice', userType: 'member', memberOfGroupIds: [], directoryRoleIds: [] },
        { id: 'u2', displayName: 'Bob', userType: 'member', memberOfGroupIds: [], directoryRoleIds: [] },
      ];

      const gaps = analyzeGaps([], { personaSource: 'resolved', resolvedUsers: users });
      expect(gaps.length).toBe(PER_USER_SCENARIOS * 2);

      const aliceGaps = gaps.filter((g) => g.personaName === 'Alice');
      const bobGaps = gaps.filter((g) => g.personaName === 'Bob');
      expect(aliceGaps.length).toBe(PER_USER_SCENARIOS);
      expect(bobGaps.length).toBe(PER_USER_SCENARIOS);
      expect(gaps.every((g) => g.personaSource === 'resolved')).toBe(true);
    });

    it('falls back to generic when no resolvedUsers provided', () => {
      const gaps = analyzeGaps([], { personaSource: 'resolved' });
      expect(gaps.length).toBe(TOTAL_SCENARIOS);
      expect(gaps[0].personaSource).toBe('generic');
    });

    it('falls back to generic when resolvedUsers is empty', () => {
      const gaps = analyzeGaps([], { personaSource: 'resolved', resolvedUsers: [] });
      expect(gaps.length).toBe(TOTAL_SCENARIOS);
      expect(gaps[0].personaSource).toBe('generic');
    });
  });
});

describe('groupGaps', () => {
  describe('grouping by severity + gapType + user + app + reason', () => {
    it('groups multiple gaps with same user/app/reason/gapType together', () => {
      const gaps: GapResult[] = [
        {
          severity: 'critical',
          gapType: 'no-policy',
          userType: 'Standard Member',
          application: 'All Cloud Apps',
          platform: 'iOS',
          clientApp: 'browser',
          location: 'trusted',
          signInRisk: 'none',
          userRisk: 'none',
          verdict: 'allow',
          requiredControls: [],
          appliedPolicyCount: 0,
          reportOnlyPolicyCount: 0,
          reason: 'No policies apply — implicit allow with no controls',
          personaName: 'Standard Member',
          personaSource: 'generic',
        },
        {
          severity: 'critical',
          gapType: 'no-policy',
          userType: 'Standard Member',
          application: 'All Cloud Apps',
          platform: 'android',
          clientApp: 'browser',
          location: 'untrusted',
          signInRisk: 'none',
          userRisk: 'none',
          verdict: 'allow',
          requiredControls: [],
          appliedPolicyCount: 0,
          reportOnlyPolicyCount: 0,
          reason: 'No policies apply — implicit allow with no controls',
          personaName: 'Standard Member',
          personaSource: 'generic',
        },
      ];

      const groups = groupGaps(gaps);
      expect(groups.length).toBe(1);
      expect(groups[0].scenarioCount).toBe(2);
      expect(groups[0].platforms).toContain('iOS');
      expect(groups[0].platforms).toContain('android');
      expect(groups[0].gapType).toBe('no-policy');
      expect(groups[0].personaName).toBe('Standard Member');
      expect(groups[0].personaSource).toBe('generic');
    });
  });

  describe('platforms are correctly collected', () => {
    it('collects unique platforms from grouped gaps', () => {
      const gaps = analyzeGaps([]);
      const groups = groupGaps(gaps);

      for (const group of groups) {
        expect(group.platforms.length).toBe(5);
        expect(group.platforms).toContain('windows');
        expect(group.platforms).toContain('macOS');
        expect(group.platforms).toContain('iOS');
        expect(group.platforms).toContain('android');
        expect(group.platforms).toContain('linux');
      }
    });
  });

  describe('sort order', () => {
    it('groups are sorted by severity (critical first)', () => {
      const gaps: GapResult[] = [
        {
          severity: 'info',
          gapType: 'report-only',
          userType: 'Standard Member',
          application: 'All Cloud Apps',
          platform: 'windows',
          clientApp: 'browser',
          location: 'trusted',
          signInRisk: 'none',
          userRisk: 'none',
          verdict: 'allow',
          requiredControls: [],
          appliedPolicyCount: 0,
          reportOnlyPolicyCount: 1,
          reason: 'Covered by report-only policies only — not currently enforced',
          personaName: 'Standard Member',
          personaSource: 'generic',
        },
        {
          severity: 'critical',
          gapType: 'no-policy',
          userType: 'Guest User',
          application: 'Office 365',
          platform: 'iOS',
          clientApp: 'browser',
          location: 'untrusted',
          signInRisk: 'none',
          userRisk: 'none',
          verdict: 'allow',
          requiredControls: [],
          appliedPolicyCount: 0,
          reportOnlyPolicyCount: 0,
          reason: 'No policies apply — implicit allow with no controls',
          personaName: 'Guest User',
          personaSource: 'generic',
        },
      ];

      const groups = groupGaps(gaps);
      expect(groups[0].severity).toBe('critical');
      expect(groups[1].severity).toBe('info');
    });
  });

  describe('group count matches total scenarios', () => {
    it('total scenarioCount across all groups equals total gaps', () => {
      const gaps = analyzeGaps([]);
      const groups = groupGaps(gaps);
      const totalInGroups = groups.reduce((sum, g) => sum + g.scenarioCount, 0);
      expect(totalInGroups).toBe(gaps.length);
    });
  });

  describe('empty policy grouping', () => {
    it('produces 9 groups (3 users × 3 apps × 1 gapType) for empty policies', () => {
      const gaps = analyzeGaps([]);
      const groups = groupGaps(gaps);
      expect(groups.length).toBe(9);
    });
  });

  describe('gapType in grouping key', () => {
    it('same user/app but different gapType produces separate groups', () => {
      const policy = createPolicy({
        grantControls: null,
        sessionControls: {
          signInFrequency: { isEnabled: true, value: 1, type: 'hours', frequencyInterval: 'everyTime' },
        },
      });

      const gaps = analyzeGaps([policy]);
      const groups = groupGaps(gaps);

      // 3 users × 3 apps × 3 gapTypes + 3 users × 3 apps × 1 legacy gapType = 27 + 9 = 36
      expect(groups.length).toBe(36);

      // Verify each gapType is represented
      const gapTypes = new Set(groups.map((g) => g.gapType));
      expect(gapTypes.has('no-mfa')).toBe(true);
      expect(gapTypes.has('no-device-compliance')).toBe(true);
      expect(gapTypes.has('no-mfa-or-device')).toBe(true);
      expect(gapTypes.has('legacy-auth-not-blocked')).toBe(true);
    });
  });

  describe('caution sort order in groups', () => {
    it('caution groups sort between warning and info', () => {
      const policy = createPolicy({
        grantControls: null,
        sessionControls: {
          signInFrequency: { isEnabled: true, value: 1, type: 'hours', frequencyInterval: 'everyTime' },
        },
      });

      const gaps = analyzeGaps([policy]);
      const groups = groupGaps(gaps);
      const severities = groups.map((g) => g.severity);

      const lastWarningIdx = severities.lastIndexOf('warning');
      const firstCautionIdx = severities.indexOf('caution');
      const lastCautionIdx = severities.lastIndexOf('caution');

      if (lastWarningIdx >= 0 && firstCautionIdx >= 0) {
        expect(lastWarningIdx).toBeLessThan(firstCautionIdx);
      }
      // No info gaps here, but caution should exist
      expect(lastCautionIdx).toBeGreaterThanOrEqual(0);
    });
  });

  describe('personaName in grouping key', () => {
    it('different personaNames produce separate groups', () => {
      const users: UserContext[] = [
        { id: 'u1', displayName: 'Alice', userType: 'member', memberOfGroupIds: [], directoryRoleIds: [] },
        { id: 'u2', displayName: 'Bob', userType: 'member', memberOfGroupIds: [], directoryRoleIds: [] },
      ];

      const gaps = analyzeGaps([], { personaSource: 'resolved', resolvedUsers: users });
      const groups = groupGaps(gaps);

      const aliceGroups = groups.filter((g) => g.personaName === 'Alice');
      const bobGroups = groups.filter((g) => g.personaName === 'Bob');
      expect(aliceGroups.length).toBeGreaterThan(0);
      expect(bobGroups.length).toBeGreaterThan(0);
      // Each should have 3 groups (3 apps × 1 gapType=no-policy)
      expect(aliceGroups.length).toBe(3);
      expect(bobGroups.length).toBe(3);
    });
  });
});

describe('detectDisagreement', () => {
  const dummyGap: GapResult = {
    severity: 'critical',
    gapType: 'no-policy',
    userType: 'Test',
    application: 'Test App',
    platform: 'windows',
    clientApp: 'browser',
    location: 'trusted',
    signInRisk: 'none',
    userRisk: 'none',
    verdict: 'allow',
    requiredControls: [],
    appliedPolicyCount: 0,
    reportOnlyPolicyCount: 0,
    reason: 'test',
    personaName: 'Test',
    personaSource: 'selected',
  };

  it('returns disagreement when generic has 0 gaps but real has gaps', () => {
    const result = detectDisagreement([], [dummyGap, dummyGap, dummyGap], 5, 1920);
    expect(result).not.toBeNull();
    expect(result!.genericGapCount).toBe(0);
    expect(result!.realGapCount).toBe(3);
    expect(result!.message).toContain('5 coverage findings');
    expect(result!.message).toMatch(/1.?920 scenarios/);
  });

  it('returns null when generic has gaps but real does not', () => {
    expect(detectDisagreement([dummyGap], [], 0, 0)).toBeNull();
  });

  it('returns null when both have gaps', () => {
    expect(detectDisagreement([dummyGap], [dummyGap], 1, 1920)).toBeNull();
  });

  it('returns null when both are empty', () => {
    expect(detectDisagreement([], [], 0, 0)).toBeNull();
  });
});

describe('sample personas in generic sweep', () => {
  it('uses sample personas when provided', () => {
    const sampleUser: UserContext = {
      id: 'sample-1',
      displayName: 'Sample User',
      userType: 'member',
      memberOfGroupIds: ['some-group'],
      directoryRoleIds: [],
    };

    const gaps = analyzeGaps([], { samplePersonas: [sampleUser] });
    expect(gaps.length).toBe(PER_USER_SCENARIOS);
    expect(gaps.every((g) => g.personaName === 'Sample User')).toBe(true);
    expect(gaps.every((g) => g.personaSource === 'generic')).toBe(true);
  });

  it('sample persona excluded via group produces critical gaps', () => {
    const breakGlass: UserContext = {
      id: 'break-glass',
      displayName: 'Break Glass Account',
      userType: 'member',
      memberOfGroupIds: ['group-breakglass'],
      directoryRoleIds: [],
    };

    const policy = createPolicy({
      conditions: createBaseConditions({
        users: {
          includeUsers: ['All'],
          excludeUsers: [],
          includeGroups: [],
          excludeGroups: ['group-breakglass'],
          includeRoles: [],
          excludeRoles: [],
        },
      }),
      grantControls: { operator: 'OR', builtInControls: ['mfa'] },
    });

    const gaps = analyzeGaps([policy], { samplePersonas: [breakGlass] });
    const critical = gaps.filter((g) => g.severity === 'critical');
    expect(critical.length).toBeGreaterThan(0);
    expect(critical[0].personaName).toBe('Break Glass Account');
  });

  it('falls back to synthetic personas when samplePersonas not provided', () => {
    const gaps = analyzeGaps([]);
    const names = new Set(gaps.map((g) => g.personaName));
    expect(names.has('Standard Member')).toBe(true);
    expect(names.has('Guest User')).toBe(true);
    expect(names.has('Global Administrator')).toBe(true);
  });
});

describe('legacy auth client app sweep', () => {
  it('sweeps all 4 client app types', () => {
    const gaps = analyzeGaps([]);
    const clientApps = new Set(gaps.map((g) => g.clientApp));
    expect(clientApps.has('browser')).toBe(true);
    expect(clientApps.has('mobileAppsAndDesktopClients')).toBe(true);
    expect(clientApps.has('exchangeActiveSync')).toBe(true);
    expect(clientApps.has('other')).toBe(true);
  });

  it('detects legacy auth gap when policy only targets modern clients', () => {
    const policy = createPolicy({
      conditions: createBaseConditions({
        clientAppTypes: ['browser', 'mobileAppsAndDesktopClients'],
      }),
      grantControls: { operator: 'OR', builtInControls: ['mfa'] },
    });

    const gaps = analyzeGaps([policy]);
    const legacyGaps = gaps.filter(
      (g) => g.clientApp === 'exchangeActiveSync' || g.clientApp === 'other',
    );
    expect(legacyGaps.length).toBeGreaterThan(0);
    expect(legacyGaps.every((g) => g.severity === 'critical')).toBe(true);
  });
});

describe('legacy auth gap detection', () => {
  it('legacy clients get legacy-auth-not-blocked warning with session-only policy', () => {
    const policy = createPolicy({
      grantControls: null,
      sessionControls: {
        signInFrequency: { isEnabled: true, value: 1, type: 'hours', frequencyInterval: 'everyTime' },
      },
    });

    const gaps = analyzeGaps([policy]);
    const legacyGaps = gaps.filter((g) => g.gapType === 'legacy-auth-not-blocked');
    expect(legacyGaps.length).toBe(LEGACY_SCENARIOS);
    expect(legacyGaps.every((g) => g.severity === 'warning')).toBe(true);
    expect(legacyGaps.every((g) =>
      g.clientApp === 'exchangeActiveSync' || g.clientApp === 'other',
    )).toBe(true);
  });

  it('non-legacy clients do not get legacy-auth-not-blocked gap', () => {
    const policy = createPolicy({
      grantControls: null,
      sessionControls: {
        signInFrequency: { isEnabled: true, value: 1, type: 'hours', frequencyInterval: 'everyTime' },
      },
    });

    const gaps = analyzeGaps([policy]);
    const nonLegacyWithLegacyGap = gaps.filter(
      (g) => g.gapType === 'legacy-auth-not-blocked' &&
        g.clientApp !== 'exchangeActiveSync' && g.clientApp !== 'other',
    );
    expect(nonLegacyWithLegacyGap.length).toBe(0);
  });

  it('legacy gap fires even when MFA and device compliance are both required', () => {
    const policy = createPolicy({
      grantControls: { operator: 'AND', builtInControls: ['mfa', 'compliantDevice'] },
    });

    const gaps = analyzeGaps([policy]);
    const legacyGaps = gaps.filter((g) => g.gapType === 'legacy-auth-not-blocked');
    expect(legacyGaps.length).toBe(LEGACY_SCENARIOS);
    // Only legacy gap, no MFA/device gaps (both are present)
    expect(gaps.every((g) => g.gapType === 'legacy-auth-not-blocked')).toBe(true);
  });

  it('block verdict suppresses legacy gap', () => {
    const policy = createPolicy({
      grantControls: { operator: 'OR', builtInControls: ['block'] },
    });

    const gaps = analyzeGaps([policy]);
    const legacyGaps = gaps.filter((g) => g.gapType === 'legacy-auth-not-blocked');
    expect(legacyGaps.length).toBe(0);
  });

  it('no-policy scenarios do not produce legacy-auth-not-blocked', () => {
    const gaps = analyzeGaps([]);
    const legacyGaps = gaps.filter((g) => g.gapType === 'legacy-auth-not-blocked');
    expect(legacyGaps.length).toBe(0);
    expect(gaps.every((g) => g.gapType === 'no-policy')).toBe(true);
  });
});

describe('getSweepScenarioCount', () => {
  it('calculates correct scenario count', () => {
    expect(getSweepScenarioCount(1)).toBe(1920);
    expect(getSweepScenarioCount(3)).toBe(5760);
  });
});

describe('mapped persona labeling', () => {
  it('preserves custom displayName as personaName in results', () => {
    const users: UserContext[] = [{
      id: 'bg-01',
      displayName: 'Break Glass (BG-01)',
      userType: 'member',
      memberOfGroupIds: [],
      directoryRoleIds: [],
    }];
    const gaps = analyzeGaps([], { personaSource: 'resolved', resolvedUsers: users });
    expect(gaps.every((g) => g.personaName === 'Break Glass (BG-01)')).toBe(true);
  });
});
