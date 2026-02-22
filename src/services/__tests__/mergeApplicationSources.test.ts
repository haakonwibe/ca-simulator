import { describe, it, expect } from 'vitest';
import { mergeApplicationSources } from '../graphService';

describe('mergeApplicationSources', () => {
  it('merges all three sources with no overlaps', () => {
    const enterprise = [{ appId: 'e1', displayName: 'Enterprise App' }];
    const registrations = [{ appId: 'r1', displayName: 'Registration App' }];
    const policy = new Map([['p1', 'Policy App']]);

    const result = mergeApplicationSources(enterprise, registrations, policy);

    expect(result).toHaveLength(3);
    expect(result.map((a) => a.source)).toEqual(['enterprise', 'policy', 'registration']);
    // Sorted alphabetically
    expect(result.map((a) => a.displayName)).toEqual([
      'Enterprise App',
      'Policy App',
      'Registration App',
    ]);
  });

  it('deduplicates: enterprise wins over registration', () => {
    const enterprise = [{ appId: 'dup-id', displayName: 'Enterprise Name' }];
    const registrations = [{ appId: 'dup-id', displayName: 'Registration Name' }];

    const result = mergeApplicationSources(enterprise, registrations, new Map());

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('enterprise');
    expect(result[0].displayName).toBe('Enterprise Name');
  });

  it('deduplicates: enterprise wins over policy-referenced', () => {
    const enterprise = [{ appId: 'dup-id', displayName: 'Enterprise Name' }];
    const policy = new Map([['dup-id', 'Policy Name']]);

    const result = mergeApplicationSources(enterprise, [], policy);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('enterprise');
    expect(result[0].displayName).toBe('Enterprise Name');
  });

  it('deduplicates: registration wins over policy-referenced', () => {
    const registrations = [{ appId: 'dup-id', displayName: 'Reg Name' }];
    const policy = new Map([['dup-id', 'Policy Name']]);

    const result = mergeApplicationSources([], registrations, policy);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('registration');
    expect(result[0].displayName).toBe('Reg Name');
  });

  it('filters out apps in BUNDLED_APP_IDS', () => {
    // Exchange Online is a bundled app
    const enterprise = [
      { appId: '00000002-0000-0ff1-ce00-000000000000', displayName: 'Exchange Online' },
      { appId: 'keep-me', displayName: 'Custom App' },
    ];

    const result = mergeApplicationSources(enterprise, [], new Map());

    expect(result).toHaveLength(1);
    expect(result[0].appId).toBe('keep-me');
  });

  it('filters out meta bundle IDs (All, Office365, None)', () => {
    const policy = new Map([
      ['All', 'All Cloud Apps'],
      ['Office365', 'Office 365'],
      ['MicrosoftAdminPortals', 'Microsoft Admin Portals'],
      ['None', 'None'],
      ['real-app', 'Real App'],
    ]);

    const result = mergeApplicationSources([], [], policy);

    expect(result).toHaveLength(1);
    expect(result[0].appId).toBe('real-app');
  });

  it('enterprise display name wins over registration name for same appId', () => {
    const enterprise = [{ appId: 'shared', displayName: 'Enterprise Display' }];
    const registrations = [{ appId: 'shared', displayName: 'Reg Display' }];

    const result = mergeApplicationSources(enterprise, registrations, new Map());

    expect(result[0].displayName).toBe('Enterprise Display');
  });

  it('returns empty array when all sources are empty', () => {
    const result = mergeApplicationSources([], [], new Map());
    expect(result).toEqual([]);
  });

  it('marks policy-only apps with source "policy"', () => {
    const policy = new Map([['orphan-id', 'Orphan App']]);

    const result = mergeApplicationSources([], [], policy);

    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('policy');
    expect(result[0].displayName).toBe('Orphan App');
  });

  it('sorts alphabetically by displayName, case-insensitive', () => {
    const enterprise = [
      { appId: 'z1', displayName: 'Zebra' },
      { appId: 'a1', displayName: 'alpha' },
      { appId: 'm1', displayName: 'Mango' },
    ];

    const result = mergeApplicationSources(enterprise, [], new Map());

    expect(result.map((a) => a.displayName)).toEqual(['alpha', 'Mango', 'Zebra']);
  });

  it('uses appId as displayName when display name is empty', () => {
    const policy = new Map([['abc-123-guid', '']]);

    const result = mergeApplicationSources([], [], policy);

    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe('abc-123-guid');
  });
});
