// ApplicationConditionMatcher tests

import { describe, it, expect } from 'vitest';
import { ApplicationConditionMatcher } from '../../conditions/ApplicationConditionMatcher';
import { isAppInBundle } from '@/data/appBundles';
import { createTestContext } from '../fixtures/testScenarios';
import type { ApplicationCondition } from '../../models/Policy';
import type { SimulationContext } from '../../models/SimulationContext';

const matcher = new ApplicationConditionMatcher();

/** Creates a default empty ApplicationCondition. Override fields as needed. */
function createApplicationCondition(overrides?: Partial<ApplicationCondition>): ApplicationCondition {
  return {
    includeApplications: [],
    excludeApplications: [],
    ...overrides,
  };
}

/** Creates a test context targeting a specific application. */
function appContext(appId: string, displayName: string, extra?: Partial<SimulationContext>): SimulationContext {
  return createTestContext({
    application: { appId, displayName },
    ...extra,
  });
}

// ──────────────────────────────────────────────
// Well-known test app contexts
// ──────────────────────────────────────────────
const TEAMS_CONTEXT = appContext('cc15fd57-2c6c-4117-a88c-83b1d56b4bbe', 'Microsoft Teams');
const EXCHANGE_CONTEXT = appContext('00000002-0000-0ff1-ce00-000000000000', 'Office 365 Exchange Online');
const SHAREPOINT_CONTEXT = appContext('00000003-0000-0ff1-ce00-000000000000', 'Office 365 SharePoint Online');
const AZURE_PORTAL_CONTEXT = appContext('c44b4083-3bb0-49c1-b47d-974e53cbdf3c', 'Azure Portal');
const AZURE_MGMT_CONTEXT = appContext('797f4846-ba00-4fd7-ba43-dac1f8f63013', 'Azure Service Management');
const CUSTOM_APP_CONTEXT = appContext('custom-app-001', 'My Custom App');

describe('ApplicationConditionMatcher', () => {
  // ──────────────────────────────────────────────
  // 'All' inclusion
  // ──────────────────────────────────────────────
  describe('includeApplications: ["All"]', () => {
    it('matches any application', () => {
      const condition = createApplicationCondition({ includeApplications: ['All'] });

      expect(matcher.evaluate(CUSTOM_APP_CONTEXT, condition).matches).toBe(true);
      expect(matcher.evaluate(TEAMS_CONTEXT, condition).matches).toBe(true);
      expect(matcher.evaluate(AZURE_PORTAL_CONTEXT, condition).matches).toBe(true);
    });

    it('returns phase "inclusion" and mentions "All"', () => {
      const condition = createApplicationCondition({ includeApplications: ['All'] });
      const result = matcher.evaluate(CUSTOM_APP_CONTEXT, condition);

      expect(result.phase).toBe('inclusion');
      expect(result.reason).toContain('All');
    });
  });

  // ──────────────────────────────────────────────
  // 'None' inclusion
  // ──────────────────────────────────────────────
  describe('includeApplications: ["None"]', () => {
    it('matches nothing', () => {
      const condition = createApplicationCondition({ includeApplications: ['None'] });

      expect(matcher.evaluate(CUSTOM_APP_CONTEXT, condition).matches).toBe(false);
      expect(matcher.evaluate(TEAMS_CONTEXT, condition).matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Specific app ID inclusion
  // ──────────────────────────────────────────────
  describe('specific app ID inclusion', () => {
    it('matches when app ID is in includeApplications', () => {
      const condition = createApplicationCondition({
        includeApplications: ['custom-app-001'],
      });
      const result = matcher.evaluate(CUSTOM_APP_CONTEXT, condition);

      expect(result.matches).toBe(true);
      expect(result.details?.matchedByTarget).toBe('custom-app-001');
    });

    it('does not match a different app', () => {
      const condition = createApplicationCondition({
        includeApplications: ['custom-app-001'],
      });
      const result = matcher.evaluate(TEAMS_CONTEXT, condition);

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Exclusion always wins
  // ──────────────────────────────────────────────
  describe('exclusion overrides inclusion', () => {
    it('excludes app even when includeApplications is "All"', () => {
      const condition = createApplicationCondition({
        includeApplications: ['All'],
        excludeApplications: ['custom-app-001'],
      });
      const result = matcher.evaluate(CUSTOM_APP_CONTEXT, condition);

      expect(result.matches).toBe(false);
      expect(result.phase).toBe('exclusion');
    });

    it('does not exclude apps not in the exclusion list', () => {
      const condition = createApplicationCondition({
        includeApplications: ['All'],
        excludeApplications: ['some-other-app'],
      });
      const result = matcher.evaluate(CUSTOM_APP_CONTEXT, condition);

      expect(result.matches).toBe(true);
    });

    it('excludes Office365 bundle via excludeApplications', () => {
      const condition = createApplicationCondition({
        includeApplications: ['All'],
        excludeApplications: ['Office365'],
      });
      const result = matcher.evaluate(TEAMS_CONTEXT, condition);

      expect(result.matches).toBe(false);
      expect(result.phase).toBe('exclusion');
    });
  });

  // ──────────────────────────────────────────────
  // Office 365 bundle
  // ──────────────────────────────────────────────
  describe('Office365 bundle inclusion', () => {
    const condition = createApplicationCondition({ includeApplications: ['Office365'] });

    it('matches Microsoft Teams (by GUID)', () => {
      const result = matcher.evaluate(TEAMS_CONTEXT, condition);
      expect(result.matches).toBe(true);
      expect(result.reason).toContain('Office 365 bundle');
    });

    it('matches Exchange Online (by app ID)', () => {
      const result = matcher.evaluate(EXCHANGE_CONTEXT, condition);
      expect(result.matches).toBe(true);
    });

    it('matches SharePoint Online (by app ID)', () => {
      const result = matcher.evaluate(SHAREPOINT_CONTEXT, condition);
      expect(result.matches).toBe(true);
    });

    it('matches Microsoft Forms (by GUID)', () => {
      const formsCtx = appContext('c9a559d2-7aab-4f13-a6ed-e7e9c52aec87', 'Microsoft Forms');
      expect(matcher.evaluate(formsCtx, condition).matches).toBe(true);
    });

    it('matches Sway (by GUID)', () => {
      const swayCtx = appContext('905fcf26-4eb7-48a0-9ff0-8dcc7194b5ba', 'Sway');
      expect(matcher.evaluate(swayCtx, condition).matches).toBe(true);
    });

    it('does NOT match Azure Portal (not in O365 bundle)', () => {
      const result = matcher.evaluate(AZURE_PORTAL_CONTEXT, condition);
      expect(result.matches).toBe(false);
    });

    it('does NOT match non-O365 apps', () => {
      // Azure Service Management is NOT in the Office 365 bundle
      const result = matcher.evaluate(AZURE_MGMT_CONTEXT, condition);
      expect(result.matches).toBe(false);
    });

    it('does NOT match a custom app', () => {
      const result = matcher.evaluate(CUSTOM_APP_CONTEXT, condition);
      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Microsoft Admin Portals bundle
  // ──────────────────────────────────────────────
  describe('MicrosoftAdminPortals bundle inclusion', () => {
    const condition = createApplicationCondition({ includeApplications: ['MicrosoftAdminPortals'] });

    it('matches Azure Portal (by app ID)', () => {
      const result = matcher.evaluate(AZURE_PORTAL_CONTEXT, condition);
      expect(result.matches).toBe(true);
      expect(result.reason).toContain('Admin Portals');
    });

    it('matches M365 Security and Compliance Center (by GUID)', () => {
      const secCompCtx = appContext('80ccca67-54bd-44ab-8625-4b79c4dc7775', 'Microsoft 365 Security and Compliance Center');
      const result = matcher.evaluate(secCompCtx, condition);
      expect(result.matches).toBe(true);
    });

    it('does NOT match non-admin apps', () => {
      const result = matcher.evaluate(TEAMS_CONTEXT, condition);
      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // User action targeting
  // ──────────────────────────────────────────────
  describe('user action targeting', () => {
    it('matches registerSecurityInformation action', () => {
      const ctx = createTestContext({
        application: {
          appId: 'irrelevant-app-id',
          displayName: 'Irrelevant App',
          userAction: 'registerSecurityInformation',
        },
      });
      const condition = createApplicationCondition({
        includeUserActions: ['urn:user:registerSecurityInformation'],
      });
      const result = matcher.evaluate(ctx, condition);

      expect(result.matches).toBe(true);
      expect(result.details?.matchedUserAction).toBe('urn:user:registerSecurityInformation');
    });

    it('matches registerOrJoinDevices action', () => {
      const ctx = createTestContext({
        application: {
          appId: 'irrelevant',
          displayName: 'Irrelevant',
          userAction: 'registerOrJoinDevices',
        },
      });
      const condition = createApplicationCondition({
        includeUserActions: ['urn:user:registerdevice'],
      });
      const result = matcher.evaluate(ctx, condition);

      expect(result.matches).toBe(true);
    });

    it('does not match when scenario has no user action', () => {
      const condition = createApplicationCondition({
        includeUserActions: ['urn:user:registerSecurityInformation'],
      });
      const result = matcher.evaluate(CUSTOM_APP_CONTEXT, condition);

      expect(result.matches).toBe(false);
    });

    it('does not match when action does not align', () => {
      const ctx = createTestContext({
        application: {
          appId: 'app',
          displayName: 'App',
          userAction: 'registerOrJoinDevices',
        },
      });
      const condition = createApplicationCondition({
        includeUserActions: ['urn:user:registerSecurityInformation'],
      });
      const result = matcher.evaluate(ctx, condition);

      expect(result.matches).toBe(false);
    });

    it('ignores app ID when user action is targeted (user action takes precedence)', () => {
      const ctx = createTestContext({
        application: {
          appId: 'custom-app-001', // Would match if checked as app
          displayName: 'My Custom App',
          userAction: 'registerSecurityInformation',
        },
      });
      // Policy targets a user action — includeApplications is irrelevant
      const condition = createApplicationCondition({
        includeApplications: ['some-other-app'],
        includeUserActions: ['urn:user:registerSecurityInformation'],
      });
      const result = matcher.evaluate(ctx, condition);

      // Should match via user action, not via app ID check
      expect(result.matches).toBe(true);
      expect(result.details?.matchedUserAction).toBe('urn:user:registerSecurityInformation');
    });
  });

  // ──────────────────────────────────────────────
  // Authentication context targeting
  // ──────────────────────────────────────────────
  describe('authentication context targeting', () => {
    it('matches correct authentication context class reference', () => {
      const ctx = createTestContext({
        application: {
          appId: 'app',
          displayName: 'App',
          authenticationContext: 'c1',
        },
      });
      const condition = createApplicationCondition({
        includeAuthenticationContextClassReferences: ['c1', 'c2'],
      });
      const result = matcher.evaluate(ctx, condition);

      expect(result.matches).toBe(true);
      expect(result.details?.matchedAuthContext).toBe('c1');
    });

    it('does not match when context has no auth context', () => {
      const condition = createApplicationCondition({
        includeAuthenticationContextClassReferences: ['c1'],
      });
      const result = matcher.evaluate(CUSTOM_APP_CONTEXT, condition);

      expect(result.matches).toBe(false);
    });

    it('does not match when auth context does not align', () => {
      const ctx = createTestContext({
        application: {
          appId: 'app',
          displayName: 'App',
          authenticationContext: 'c3',
        },
      });
      const condition = createApplicationCondition({
        includeAuthenticationContextClassReferences: ['c1', 'c2'],
      });
      const result = matcher.evaluate(ctx, condition);

      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Unconfigured (empty everything)
  // ──────────────────────────────────────────────
  describe('unconfigured condition', () => {
    it('matches all apps when includeApplications is empty and no user actions/auth context', () => {
      const condition = createApplicationCondition();
      const result = matcher.evaluate(CUSTOM_APP_CONTEXT, condition);

      expect(result.matches).toBe(true);
      expect(result.phase).toBe('unconfigured');
    });
  });

  // ──────────────────────────────────────────────
  // Context appId: "All" (All Cloud Apps simulation)
  // ──────────────────────────────────────────────
  describe('context appId "All" (All Cloud Apps simulation)', () => {
    const allAppsContext = appContext('All', 'All Cloud Apps');

    it('matches policy targeting "Office365"', () => {
      const condition = createApplicationCondition({ includeApplications: ['Office365'] });
      const result = matcher.evaluate(allAppsContext, condition);
      expect(result.matches).toBe(true);
      expect(result.reason).toContain('All Cloud Apps');
    });

    it('matches policy targeting a specific app ID', () => {
      const condition = createApplicationCondition({ includeApplications: ['custom-app-001'] });
      const result = matcher.evaluate(allAppsContext, condition);
      expect(result.matches).toBe(true);
    });

    it('matches policy targeting "All"', () => {
      const condition = createApplicationCondition({ includeApplications: ['All'] });
      const result = matcher.evaluate(allAppsContext, condition);
      expect(result.matches).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Context appId: "Office365" (Office 365 simulation)
  // ──────────────────────────────────────────────
  describe('context appId "Office365" (Office 365 simulation)', () => {
    const o365Context = appContext('Office365', 'Office 365');

    it('matches policy targeting "All"', () => {
      const condition = createApplicationCondition({ includeApplications: ['All'] });
      const result = matcher.evaluate(o365Context, condition);
      expect(result.matches).toBe(true);
    });

    it('matches policy targeting "Office365"', () => {
      const condition = createApplicationCondition({ includeApplications: ['Office365'] });
      const result = matcher.evaluate(o365Context, condition);
      expect(result.matches).toBe(true);
    });

    it('does NOT match policy targeting a specific non-O365 app', () => {
      const condition = createApplicationCondition({
        includeApplications: ['797f4846-ba00-4fd7-ba43-dac1f8f63013'], // Azure Service Management
      });
      const result = matcher.evaluate(o365Context, condition);
      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Context appId: "MicrosoftAdminPortals" (Admin Portals simulation)
  // ──────────────────────────────────────────────
  describe('context appId "MicrosoftAdminPortals" (Admin Portals simulation)', () => {
    const adminContext = appContext('MicrosoftAdminPortals', 'Microsoft Admin Portals');

    it('matches policy targeting "All"', () => {
      const condition = createApplicationCondition({ includeApplications: ['All'] });
      const result = matcher.evaluate(adminContext, condition);
      expect(result.matches).toBe(true);
    });

    it('matches policy targeting "MicrosoftAdminPortals"', () => {
      const condition = createApplicationCondition({ includeApplications: ['MicrosoftAdminPortals'] });
      const result = matcher.evaluate(adminContext, condition);
      expect(result.matches).toBe(true);
    });

    it('matches policy targeting Azure Portal app ID (member of bundle)', () => {
      const condition = createApplicationCondition({
        includeApplications: ['c44b4083-3bb0-49c1-b47d-974e53cbdf3c'],
      });
      const result = matcher.evaluate(adminContext, condition);
      expect(result.matches).toBe(true);
    });

    it('matches policy targeting Security & Compliance Center app ID (member of bundle)', () => {
      const condition = createApplicationCondition({
        includeApplications: ['80ccca67-54bd-44ab-8625-4b79c4dc7775'],
      });
      const result = matcher.evaluate(adminContext, condition);
      expect(result.matches).toBe(true);
    });

    it('does NOT match policy targeting Azure Service Management (not in bundle)', () => {
      const condition = createApplicationCondition({
        includeApplications: ['797f4846-ba00-4fd7-ba43-dac1f8f63013'],
      });
      const result = matcher.evaluate(adminContext, condition);
      expect(result.matches).toBe(false);
    });

    it('does NOT match policy targeting Office365', () => {
      const condition = createApplicationCondition({ includeApplications: ['Office365'] });
      const result = matcher.evaluate(adminContext, condition);
      expect(result.matches).toBe(false);
    });

    it('does NOT match policy targeting a non-admin app', () => {
      const condition = createApplicationCondition({ includeApplications: ['custom-app-001'] });
      const result = matcher.evaluate(adminContext, condition);
      expect(result.matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Context appId: "AzureVirtualDesktop" (AVD simulation)
  // ──────────────────────────────────────────────
  describe('context appId "AzureVirtualDesktop" (AVD simulation)', () => {
    const avdBundleContext = appContext('AzureVirtualDesktop', 'Azure Virtual Desktop');

    it('matches policy targeting "All"', () => {
      const condition = createApplicationCondition({ includeApplications: ['All'] });
      const result = matcher.evaluate(avdBundleContext, condition);
      expect(result.matches).toBe(true);
    });

    it('matches policy targeting AVD app ID (member of bundle)', () => {
      const condition = createApplicationCondition({
        includeApplications: ['9cdead84-a844-4324-93f2-b2e6bb768d07'],
      });
      const result = matcher.evaluate(avdBundleContext, condition);
      expect(result.matches).toBe(true);
    });

    it('matches policy targeting Remote Desktop app ID (member of bundle)', () => {
      const condition = createApplicationCondition({
        includeApplications: ['a4a365df-50f1-4397-bc59-1a1564b8bb9c'],
      });
      const result = matcher.evaluate(avdBundleContext, condition);
      expect(result.matches).toBe(true);
    });

    it('matches policy targeting Windows Cloud Login app ID (member of bundle)', () => {
      const condition = createApplicationCondition({
        includeApplications: ['270efc09-cd0d-444b-a71f-39af4910ec45'],
      });
      const result = matcher.evaluate(avdBundleContext, condition);
      expect(result.matches).toBe(true);
    });

    it('does NOT match policy targeting Office365', () => {
      const condition = createApplicationCondition({ includeApplications: ['Office365'] });
      const result = matcher.evaluate(avdBundleContext, condition);
      expect(result.matches).toBe(false);
    });

    it('does NOT match policy targeting a specific non-AVD app', () => {
      const condition = createApplicationCondition({ includeApplications: ['custom-app-001'] });
      const result = matcher.evaluate(avdBundleContext, condition);
      expect(result.matches).toBe(false);
    });

    it('matches unconfigured condition (empty includeApplications)', () => {
      const condition = createApplicationCondition();
      const result = matcher.evaluate(avdBundleContext, condition);
      expect(result.matches).toBe(true);
      expect(result.phase).toBe('unconfigured');
    });
  });

  // ──────────────────────────────────────────────
  // AVD bundle as policy target (individual app matches)
  // ──────────────────────────────────────────────
  describe('AzureVirtualDesktop as policy target', () => {
    const condition = createApplicationCondition({ includeApplications: ['AzureVirtualDesktop'] });

    it('matches AVD app by ID', () => {
      const ctx = appContext('9cdead84-a844-4324-93f2-b2e6bb768d07', 'Azure Virtual Desktop');
      expect(matcher.evaluate(ctx, condition).matches).toBe(true);
    });

    it('matches Remote Desktop app by ID', () => {
      const ctx = appContext('a4a365df-50f1-4397-bc59-1a1564b8bb9c', 'Microsoft Remote Desktop');
      expect(matcher.evaluate(ctx, condition).matches).toBe(true);
    });

    it('does NOT match non-AVD app', () => {
      expect(matcher.evaluate(CUSTOM_APP_CONTEXT, condition).matches).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Exclusion accuracy with specific app IDs
  // ──────────────────────────────────────────────
  describe('exclusion accuracy with specific app IDs', () => {
    const AVD_APP_ID = '9cdead84-a844-4324-93f2-b2e6bb768d07';
    const avdContext = appContext(AVD_APP_ID, 'Azure Virtual Desktop');

    it('excludes specific app when policy includes All but excludes that app', () => {
      const condition = createApplicationCondition({
        includeApplications: ['All'],
        excludeApplications: [AVD_APP_ID],
      });
      const result = matcher.evaluate(avdContext, condition);

      expect(result.matches).toBe(false);
      expect(result.phase).toBe('exclusion');
      expect(result.reason).toContain('excluded');
    });

    it('matches a different app when policy includes All but excludes AVD', () => {
      const condition = createApplicationCondition({
        includeApplications: ['All'],
        excludeApplications: [AVD_APP_ID],
      });
      const result = matcher.evaluate(SHAREPOINT_CONTEXT, condition);

      expect(result.matches).toBe(true);
    });

    it('excludes AVD with reason mentioning exclusion', () => {
      const condition = createApplicationCondition({
        includeApplications: ['All'],
        excludeApplications: [AVD_APP_ID],
      });
      const result = matcher.evaluate(avdContext, condition);

      expect(result.matches).toBe(false);
      expect(result.phase).toBe('exclusion');
      expect(result.details?.excludedByTarget).toBe(AVD_APP_ID);
    });

    it('excludes specific O365 sub-app when policy includes Office365 but excludes that sub-app', () => {
      const condition = createApplicationCondition({
        includeApplications: ['Office365'],
        excludeApplications: ['00000003-0000-0ff1-ce00-000000000000'], // SharePoint
      });
      const result = matcher.evaluate(SHAREPOINT_CONTEXT, condition);

      expect(result.matches).toBe(false);
      expect(result.phase).toBe('exclusion');
    });
  });

  // ──────────────────────────────────────────────
  // Context "All" does NOT check exclusions (simulating "any app")
  // ──────────────────────────────────────────────
  describe('context "All" ignores exclusions', () => {
    it('context "All" still matches even when policy excludes a specific app', () => {
      const allAppsContext = appContext('All', 'All Cloud Apps');
      const condition = createApplicationCondition({
        includeApplications: ['All'],
        excludeApplications: ['9cdead84-a844-4324-93f2-b2e6bb768d07'],
      });
      const result = matcher.evaluate(allAppsContext, condition);

      // "All Cloud Apps" simulation means "any app" — exclusion of a specific app
      // doesn't prevent the policy from broadly applying
      expect(result.matches).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // isAppInBundle (from @/data/appBundles)
  // ──────────────────────────────────────────────
  describe('isAppInBundle', () => {
    it('returns true for known Office365 member', () => {
      expect(isAppInBundle('cc15fd57-2c6c-4117-a88c-83b1d56b4bbe', 'Office365')).toBe(true);
    });

    it('returns true when appId equals bundleName', () => {
      expect(isAppInBundle('Office365', 'Office365')).toBe(true);
    });

    it('returns false for unknown bundle', () => {
      expect(isAppInBundle('cc15fd57-2c6c-4117-a88c-83b1d56b4bbe', 'NonExistentBundle')).toBe(false);
    });

    it('returns false for app not in bundle', () => {
      // Azure Portal is not in Office365 bundle
      expect(isAppInBundle('c44b4083-3bb0-49c1-b47d-974e53cbdf3c', 'Office365')).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // Cross-bundle verification
  // ──────────────────────────────────────────────
  describe('cross-bundle verification', () => {
    it('policy targeting Office365 does NOT match Azure Portal', () => {
      const condition = createApplicationCondition({ includeApplications: ['Office365'] });
      const result = matcher.evaluate(AZURE_PORTAL_CONTEXT, condition);
      expect(result.matches).toBe(false);
    });

    it('policy excluding Office365 excludes Teams (by GUID)', () => {
      const condition = createApplicationCondition({
        includeApplications: ['All'],
        excludeApplications: ['Office365'],
      });
      const result = matcher.evaluate(TEAMS_CONTEXT, condition);
      expect(result.matches).toBe(false);
      expect(result.phase).toBe('exclusion');
    });

    it('policy targeting specific Exchange ID does NOT match context "Office365"', () => {
      const o365Context = appContext('Office365', 'Office 365');
      const condition = createApplicationCondition({
        includeApplications: ['00000002-0000-0ff1-ce00-000000000000'], // Exchange Online
      });
      const result = matcher.evaluate(o365Context, condition);
      expect(result.matches).toBe(true); // Exchange IS a member of Office365
    });
  });

  // ──────────────────────────────────────────────
  // Trace quality
  // ──────────────────────────────────────────────
  describe('trace quality', () => {
    it('always returns conditionType "applications"', () => {
      const condition = createApplicationCondition({ includeApplications: ['All'] });
      const result = matcher.evaluate(CUSTOM_APP_CONTEXT, condition);

      expect(result.conditionType).toBe('applications');
    });

    it('always returns a non-empty reason', () => {
      const condition = createApplicationCondition({ includeApplications: ['nonexistent-app'] });
      const result = matcher.evaluate(CUSTOM_APP_CONTEXT, condition);

      expect(result.reason).toBeTruthy();
    });
  });
});
