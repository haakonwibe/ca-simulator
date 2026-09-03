// data/__tests__/sampleLessons.test.ts — The teaching notes must stay true.
//
// Same idea as the template self-test loop: a note that promises "switch this
// and watch X change" is a claim about the engine. If the engine or the sample
// policies drift, the note becomes a lie that nothing else would catch — it
// would simply keep rendering, confidently wrong.

import { describe, it, expect } from 'vitest';
import { SAMPLE_LESSONS, getSampleLesson } from '../sampleLessons';
import { SAMPLE_POLICIES } from '../samplePolicies';
import { SAMPLE_PERSONAS } from '../samplePersonas';
import { CAEngine } from '@/engine/CAEngine';
import { deriveSatisfiedControls } from '@/lib/deriveSatisfiedControls';
import type { SimulationContext, DeviceContext } from '@/engine/models/SimulationContext';

const engine = new CAEngine();
const POWER_BI = '00000009-0000-0000-c000-000000000000';
const AZURE_DEVOPS = '499b84ac-1321-427f-aa17-267ca6975798';

/** Mirrors the ScenarioPanel: 'unregistered' means no trustType at all. */
const TRUST: Record<string, DeviceContext['trustType'] | undefined> = {
  unregistered: undefined,
  entraJoined: 'azureADJoined',
  entraRegistered: 'azureADRegistered',
  hybrid: 'hybridAzureADJoined',
};

function scenario(appId: string, deviceJoin: string): SimulationContext {
  const trustType = TRUST[deviceJoin];
  return {
    user: SAMPLE_PERSONAS[0], // Alex Johnson — a plain member
    application: { appId, displayName: appId },
    device: { platform: 'windows', ...(trustType ? { trustType } : {}) },
    location: { isTrustedLocation: false },
    risk: { signInRiskLevel: 'none', userRiskLevel: 'none', insiderRiskLevel: 'none' },
    clientAppType: 'browser',
    authenticationFlow: 'none',
    authenticationStrengthLevel: 0,
    satisfiedControls: deriveSatisfiedControls({
      authentication: 'none',
      deviceCompliance: 'any',
      deviceJoin,
      appProtection: 'none',
      passwordChanged: false,
    }),
  };
}

const appliesTo = (appId: string, join: string, prefix: string) =>
  engine.evaluate(SAMPLE_POLICIES, scenario(appId, join)).appliedPolicies.some((p) =>
    p.policyName.startsWith(prefix),
  );

const grantSatisfied = (appId: string, join: string, prefix: string) =>
  engine
    .evaluate(SAMPLE_POLICIES, scenario(appId, join))
    .appliedPolicies.find((p) => p.policyName.startsWith(prefix))?.grantControls?.satisfied;

describe('sample lessons', () => {
  it('every note names a policy that exists, exactly once', () => {
    const ids = SAMPLE_POLICIES.map((p) => p.id);
    for (const lesson of SAMPLE_LESSONS) {
      expect(ids, lesson.title).toContain(lesson.policyId);
      expect(getSampleLesson(lesson.policyId)?.title).toBe(lesson.title);
    }
    expect(new Set(SAMPLE_LESSONS.map((l) => l.policyId)).size).toBe(SAMPLE_LESSONS.length);
  });

  it('leaves ordinary policies unannotated — a note on every policy is noise', () => {
    // The card renders only when getSampleLesson finds one, so this IS the
    // negative case: CA001 and friends show nothing.
    expect(getSampleLesson('ca-policy-001-mfa-all-office365')).toBeUndefined();
    expect(getSampleLesson('ca-policy-003-mfa-admins')).toBeUndefined();
    expect(getSampleLesson('no-such-policy')).toBeUndefined();
    expect(SAMPLE_LESSONS.length).toBeLessThan(SAMPLE_POLICIES.length / 2);
  });

  it('every note says what to try, and says it as a label not an essay', () => {
    for (const lesson of SAMPLE_LESSONS) {
      expect(lesson.tryThis.length, lesson.title).toBeGreaterThan(20);
      expect(lesson.title.endsWith('.'), lesson.title).toBe(false);
      expect(lesson.body.length, lesson.title).toBeGreaterThan(40);
    }
  });

  // ── The claims themselves ──

  it('CA021: a negative device rule matches an unregistered device, not an Entra joined one', () => {
    expect(appliesTo(POWER_BI, 'unregistered', 'CA021')).toBe(true);
    expect(appliesTo(POWER_BI, 'entraJoined', 'CA021')).toBe(false);
  });

  it('CA022: hybrid join alone satisfies the hybrid-joined control', () => {
    expect(grantSatisfied(AZURE_DEVOPS, 'entraJoined', 'CA022')).toBe(false);
    expect(grantSatisfied(AZURE_DEVOPS, 'entraRegistered', 'CA022')).toBe(false);
    expect(grantSatisfied(AZURE_DEVOPS, 'hybrid', 'CA022')).toBe(true);
  });

  it('CA012 is report-only and CA019 stops at the trusted network', () => {
    const ca012 = SAMPLE_POLICIES.find((p) => p.id === 'ca-policy-012-phishing-resistant-admins')!;
    expect(ca012.state).toBe('enabledForReportingButNotEnforced');

    const ca019 = SAMPLE_POLICIES.find((p) => p.id === 'ca-policy-019-session-controls-untrusted')!;
    expect(ca019.conditions.locations?.excludeLocations).toContain('AllTrusted');
  });

  it('CA015 targets a user action, so it can name no application', () => {
    const ca015 = SAMPLE_POLICIES.find((p) => p.id === 'ca-policy-015-mfa-security-info-registration')!;
    expect(ca015.conditions.applications.includeUserActions?.length).toBeGreaterThan(0);
    expect(ca015.conditions.applications.includeApplications).toEqual([]);
  });

  it('CA017 names a custom strength the tenant map resolves, not a built-in one', () => {
    const ca017 = SAMPLE_POLICIES.find((p) => p.id === 'ca-policy-017-custom-auth-strength-admin-portals')!;
    const id = ca017.grantControls?.authenticationStrength?.id;
    expect(id).toBe('00000000-0000-0000-0000-000000000099');
    expect(ca017.grantControls?.builtInControls).toEqual([]);
  });
});
