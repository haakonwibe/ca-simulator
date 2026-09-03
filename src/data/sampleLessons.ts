// data/sampleLessons.ts — What the sample tenant is trying to teach.
//
// The sample policies are not a random tenant: several carry a deliberate flaw
// or a deliberate subtlety, and until now that intent lived only in code
// comments. These notes put it on the policy itself, in demo mode only, where
// someone exploring will actually meet it.
//
// A note earns its place by naming something you can DO and what to watch —
// the sandbox makes every one of them reversible in two clicks.
//
// Scope: these are the hard-won lessons from docs/project-instructions.md,
// surfaced where someone meets the policy instead of left in a document. Only
// policies that teach one get a note; an ordinary policy stays plain, or the
// notes stop being worth reading.

export interface SampleLesson {
  /** Sample policy id the note belongs to */
  policyId: string;
  /** Short heading for the note card */
  title: string;
  /** Why this policy is shaped the way it is */
  body: string;
  /** One concrete thing to try, and what changes when you do */
  tryThis: string;
}

export const SAMPLE_LESSONS: readonly SampleLesson[] = [
  {
    policyId: 'ca-policy-024-mfa-remote-help',
    title: 'An exclusion should remove one control, not all of them',
    body:
      'CA004 excludes Remote Help from the device compliance requirement, which is right: the person whose device just fell out of compliance is exactly the person who needs help. That exclusion must not take multifactor authentication with it, because the sharer can still reach for their phone.',
    tryThis:
      'Switch this policy Off in the sandbox. The Baseline check "Require multifactor authentication for Remote Help" drops to partial, because the only MFA left is CA019, which covers untrusted locations only.',
  },
  {
    policyId: 'ca-policy-004-compliant-device',
    title: 'The exclusion that prevents a catch-22',
    body:
      "Remote Assistance Service is excluded here on purpose. A blanket compliant-device requirement locks out the user whose device is not compliant, and that is the user calling the helpdesk. Microsoft's deployment guidance says to exclude it. What goes wrong is carrying the same exclusion over to policies that are not about devices.",
    tryThis:
      'Remove Remote Assistance Service from the excluded applications in the sandbox, then evaluate a non-compliant member against Remote Help. The session that was meant to fix the device now needs the device fixed first.',
  },
  {
    policyId: 'ca-policy-002-block-legacy-auth',
    title: 'One exclusion, a hole nobody names',
    body:
      'Sam Chen is excluded from the legacy authentication block. Every other policy in this tenant is scoped to browser and modern clients, so for legacy clients Sam matches nothing at all and the engine returns an implicit allow.',
    tryThis:
      'Open the Gaps tab and look at Sam Chen with a legacy client. The finding is critical, and it comes from an exclusion on a policy that looks unrelated.',
  },
  {
    policyId: 'ca-policy-012-phishing-resistant-admins',
    title: 'Report-only is measured, never enforced',
    body:
      'This policy is fully evaluated and appears in the results, but it never contributes to the verdict. That is the point of report-only, and it is also how a control an organisation believes it has can sit unenforced for months.',
    tryThis:
      'Evaluate an administrator, then switch this policy to On in the sandbox. The required controls gain phishing-resistant MFA, and the Baseline check for administrators changes with it.',
  },
  {
    policyId: 'ca-policy-015-mfa-security-info-registration',
    title: 'A user action is not a cloud app',
    body:
      'This policy targets the act of registering security information rather than any application, and a policy is only ever in one targeting mode. It therefore covers a registration forced during sign-in to any app, and covers nothing about browsing the My Sign-ins portal.',
    tryThis:
      'Set Target Resource to User Actions and evaluate. Then switch to Resources and pick My Sign-ins: this policy is skipped, because the portal and the registration are different targets.',
  },
  {
    policyId: 'ca-policy-017-custom-auth-strength-admin-portals',
    title: 'A custom strength is only as strong as its tier',
    body:
      'This grant names a custom authentication strength, not a built-in one. The engine resolves it through the tenant’s strength map to a tier, and only tier three counts as phishing-resistant. A custom strength the tenant cannot resolve grades as ordinary MFA, never as phishing-resistant.',
    tryThis:
      'Set Authentication to Phishing-resistant MFA and evaluate an administrator against Microsoft Admin Portals. Drop it to MFA and the same policy is no longer satisfied.',
  },
  {
    policyId: 'ca-policy-019-session-controls-untrusted',
    title: 'Scoping by location leaves the other half uncovered',
    body:
      'All locations except trusted ones means this policy contributes nothing on a trusted network. That is deliberate here, but it is also why Remote Help needed its own MFA policy: this one was the only MFA reaching that service, and it stops at the office door.',
    tryThis:
      'Set Location to Trusted and evaluate. The required controls shrink. Switch CA024 Off as well and the Baseline check for Remote Help drops to partial.',
  },
  {
    policyId: 'ca-policy-021-mfa-non-entra-joined',
    title: 'A negative device rule matches a missing property',
    body:
      'The rule reads "trust type is not Entra joined". An unregistered device has no trust type at all, and a missing property satisfies a negative comparison, so this policy applies to unregistered devices as well as to Entra registered and hybrid ones.',
    tryThis:
      'Evaluate against Power BI with Device Join Type set to Unregistered, then to Entra joined. The policy applies in the first case and is skipped in the second.',
  },
  {
    policyId: 'ca-policy-022-hybrid-join-lob',
    title: 'Hybrid joined means hybrid joined',
    body:
      'The "Require Microsoft Entra hybrid joined device" control is satisfied by hybrid join only. Entra joined and Entra registered do not satisfy it, which surprises people who read it as a general device trust requirement.',
    tryThis:
      'Evaluate against Azure DevOps with Device Join Type set to Entra joined. The control is still not satisfied. Switch to Hybrid joined and it is.',
  },
  {
    policyId: 'ca-policy-023-remote-help-operators',
    title: 'Who is in the group is the risk',
    body:
      'This policy puts the stronger bar on the people driving support sessions: a compliant device and phishing-resistant MFA. No synthetic persona can stand in for a helper, because helper status is an Intune role assignment that nothing in Entra exposes.',
    tryThis:
      'Open Baseline, map Morgan Helpdesk to the Remote Help Operator slot, and the operator check moves from "needs mapping" to a verdict. Nothing else in the tool can answer that question for you.',
  },
];

export function getSampleLesson(policyId: string): SampleLesson | undefined {
  return SAMPLE_LESSONS.find((l) => l.policyId === policyId);
}
