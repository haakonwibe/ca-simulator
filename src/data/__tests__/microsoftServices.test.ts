// data/__tests__/microsoftServices.test.ts — Curated first-party resource list.
//
// Every entry is doc-sourced; these guard the shape and the two claims the UI
// leans on (Graph is unsupported, Azure AD Graph is filter-only).

import { describe, it, expect } from 'vitest';
import {
  MICROSOFT_SERVICES,
  MICROSOFT_SERVICE_IDS,
  MICROSOFT_GRAPH_APP_ID,
  AZURE_AD_GRAPH_APP_ID,
  getMicrosoftService,
  CA_TARGET_BADGE,
  isNameableInPolicy,
} from '../microsoftServices';
import { BUNDLE_IDS, BUNDLED_APP_IDS } from '../appBundles';
import { REMOTE_HELP_APP_ID, AZURE_MANAGEMENT_APP_ID } from '../baselineChecks';
import { isGuid } from '@/lib/guid';

describe('Microsoft services catalog', () => {
  it('every entry is a well-formed, unique GUID with a description and a docs URL', () => {
    for (const s of MICROSOFT_SERVICES) {
      expect(isGuid(s.appId), s.displayName).toBe(true);
      expect(s.description.length, s.displayName).toBeGreaterThan(20);
      // The picker row is one scannable line — the long form belongs on the verdict
      expect(s.summary.length, s.displayName).toBeGreaterThan(0);
      expect(s.summary.length, s.displayName).toBeLessThanOrEqual(64);
      // A label, not a sentence — domain names carry dots, so only the ending matters
      expect(s.summary.endsWith('.'), s.displayName).toBe(false);
      expect(s.docsUrl.startsWith('https://learn.microsoft.com/'), s.displayName).toBe(true);
    }
    expect(MICROSOFT_SERVICE_IDS.size).toBe(MICROSOFT_SERVICES.length);
  });

  it('Microsoft Graph is the umbrella the portal refuses; Azure AD Graph is filter-only', () => {
    expect(getMicrosoftService(MICROSOFT_GRAPH_APP_ID)?.caTarget).toBe('unsupported');
    expect(getMicrosoftService(AZURE_AD_GRAPH_APP_ID)?.caTarget).toBe('filter-only');
  });

  it('only selectable resources are offered to the sandbox', () => {
    const nameable = MICROSOFT_SERVICES.filter(isNameableInPolicy).map((s) => s.appId);
    expect(nameable).not.toContain(MICROSOFT_GRAPH_APP_ID);
    expect(nameable).not.toContain(AZURE_AD_GRAPH_APP_ID);
    expect(nameable).toContain(REMOTE_HELP_APP_ID);
    expect(nameable).toContain(AZURE_MANAGEMENT_APP_ID);
  });

  it('does not overlap the bundle registry — a member of Office 365 belongs to the bundle, not here', () => {
    for (const s of MICROSOFT_SERVICES) {
      expect(BUNDLED_APP_IDS.has(s.appId), s.displayName).toBe(false);
      expect(BUNDLE_IDS.has(s.appId), s.displayName).toBe(false);
    }
  });

  it('lists every nameable resource before the ones no policy can name', () => {
    // Picker order is array order — Remote Help first, the two specials last.
    const firstSpecial = MICROSOFT_SERVICES.findIndex((s) => !isNameableInPolicy(s));
    const lastNameable = MICROSOFT_SERVICES.map(isNameableInPolicy).lastIndexOf(true);
    expect(firstSpecial).toBeGreaterThan(lastNameable);
    expect(MICROSOFT_SERVICES[0].appId).toBe(REMOTE_HELP_APP_ID);
  });

  it('tags only the resources that behave unlike an ordinary app', () => {
    for (const s of MICROSOFT_SERVICES) {
      const badge = CA_TARGET_BADGE[s.caTarget];
      expect(badge === null, s.displayName).toBe(isNameableInPolicy(s));
    }
    expect(CA_TARGET_BADGE[getMicrosoftService(MICROSOFT_GRAPH_APP_ID)!.caTarget]).toBe('All resources only');
    expect(CA_TARGET_BADGE[getMicrosoftService(AZURE_AD_GRAPH_APP_ID)!.caTarget]).toBe('Filter only');
  });

  it('unknown ids resolve to undefined', () => {
    expect(getMicrosoftService('not-an-app')).toBeUndefined();
  });
});
