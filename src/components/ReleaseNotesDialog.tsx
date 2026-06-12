// components/ReleaseNotesDialog.tsx — "What's New" release notes dialog.

import { COLORS } from '@/data/theme';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface ReleaseVersion {
  version: string;
  subtitle: string;
  features: { heading: string; body: string }[];
}

const RELEASES: ReleaseVersion[] = [
  {
    version: 'v0.6.8',
    subtitle: 'AI Agents Baseline',
    features: [
      {
        heading: 'AI Agents Baseline Checks',
        body: "Three new checks assess your agent posture against Microsoft's recommendations: block high-risk agent identities, allow only approved agent identities (deny-by-default), and block risky agents' user accounts. Each comes with a Fix in Sandbox template — and because verdicts are outcome-based, a deny-by-default policy that blocks all agents correctly satisfies the high-risk check too.",
      },
      {
        heading: 'Agent-Aware Diff and Impact',
        body: 'The sandbox comparison and the Impact view now sweep dedicated agent scenario grids alongside the user sweep. Agent policy changes show their real effect — previously blocked agent scenarios opening up escalate removal severity to Critical — while user posture scoring stays cleanly user-scoped.',
      },
      {
        heading: 'Agent List Editing in the Sandbox',
        body: 'Agent-targeted policies now edit their included and excluded agent identity lists with the same chip interface as user and app scoping, with known agents offered by name. The inert user fields on agent policies are no longer shown.',
      },
      {
        heading: 'Refinements',
        body: "Agent risk conditions now apply to agent user account simulations, matching Microsoft's documented recommendations, and report-only agent policies explain their zero enforcement impact instead of showing empty counts.",
      },
    ],
  },
  {
    version: 'v0.6.6',
    subtitle: 'Agent Identities',
    features: [
      {
        heading: 'Simulate Agent Sign-ins',
        body: 'A new Identity Type selector covers the three Entra Agent ID patterns: agent identities acting autonomously, agent user accounts, and humans accessing agent resources. Pick an agent, set its risk level, and evaluate — with the full condition trace showing exactly why each policy applied or was skipped.',
      },
      {
        heading: 'Faithful Agent Policy Display',
        body: "Policies targeting agent identities now load with their real targeting and risk conditions visible. The policy list reads from the Graph beta endpoint, since v1.0 omits agent properties entirely — previously these policies appeared to target nobody. A new lime Agents category marks them across the Grid, Matrix, and detail panel.",
      },
      {
        heading: 'Accurate Agent Semantics',
        body: 'The engine mirrors the documented Entra behavior: agent-targeting policies never apply to user sign-ins, "All users" does not cover agent user accounts, group scoping does not apply to agents, and agent risk uses direct level matching. Attribute-based agent filters are displayed and flagged as not evaluated rather than guessed.',
      },
      {
        heading: 'Sandbox and Export Aware',
        body: 'Agent policies work with the sandbox state toggles and live comparison, and exported changes route to the correct Graph endpoint so agent targeting is never lost on write. Sample mode includes a high-risk agent block policy to explore without a tenant.',
      },
    ],
  },
  {
    version: 'v0.6.4',
    subtitle: 'Remediation Bridge',
    features: [
      {
        heading: 'Fix in Sandbox',
        body: "Failing Baseline checks now have a Fix in Sandbox button that drafts the corresponding Microsoft template policy directly into the sandbox. The assessment re-runs instantly — watch the check flip to Pass, see Gaps and Impact react, and tune the draft's scoping with the assignment editor before anything touches your tenant.",
      },
      {
        heading: 'Draft Policies',
        body: 'Drafts are full policies that exist only in the sandbox, marked with a dashed border and a NEW badge in the Grid. Every view, sweep, and assessment evaluates them like real policies, and they survive tenant refreshes until you delete or reset them.',
      },
      {
        heading: 'Change Plan Export',
        body: 'Export your entire sandbox — state toggles, scoping edits, and drafts — as a deployment-ready package: a Markdown change summary with a deployment checklist, a Microsoft Graph PowerShell script with plain-language comments per change, and Graph-ready policy JSON. Everything is generated locally in your browser; the app never writes to your tenant.',
      },
      {
        heading: 'Safety by Default',
        body: 'New policies export in a non-enforcing state — Off by default, matching the portal, with Report-only one click away. The deployment checklist carries the standing reminders: break-glass exclusions, pilot groups, and reviewing before running.',
      },
    ],
  },
  {
    version: 'v0.6.2',
    subtitle: 'Sandbox Assignment Editing',
    features: [
      {
        heading: 'Edit Policy Scoping in the Sandbox',
        body: 'Sandbox mode now goes beyond state toggles: open any policy and edit who and what it applies to. Remove any included or excluded user, group, role, or application with one click, and add users (via search or the All / None / Guests values) and applications (from bundles and your tenant apps). Every view — results, Gaps, Impact, Baseline — reflects the edited scoping instantly.',
      },
      {
        heading: 'Clear Change Tracking',
        body: 'Removed entries stay visible as struck-through ghost chips with one-click restore, added entries are highlighted, and the diff panel itemizes every scoping change by field with display names. A Revert button discards all sandbox changes for a single policy.',
      },
      {
        heading: 'Stronger Sandbox Signals',
        body: 'Modified policies are now unmistakable in the Grid view — an amber ring and a beaker badge mark every tile that differs from live state, using the same color as the sandbox bar throughout the app.',
      },
      {
        heading: 'Readable Policy Summaries',
        body: 'The policy detail panel now lists who and what a policy targets by name — included and excluded users, groups, roles, guest types, and applications — instead of compact counts.',
      },
    ],
  },
  {
    version: 'v0.6.0',
    subtitle: 'Baseline Assessment',
    features: [
      {
        heading: 'Baseline Tab',
        body: "Assess your tenant against 18 checks drawn from Microsoft's Conditional Access policy templates — Secure Foundation, Zero Trust, Remote Work, Protect Administrators, and Emerging Threats. Each check reports Pass, Partial, Report-only, or Fail, with category filters and license indicators for P2 and Purview features.",
      },
      {
        heading: 'Outcome-Based Verdicts',
        body: 'Checks judge what your policies actually do, not what they look like. Each one runs targeted sign-in scenarios through the evaluation engine and verifies the expected protection is guaranteed — so a custom-built policy that blocks legacy authentication passes, while a template lookalike with a scope hole shows exactly which scenarios get through.',
      },
      {
        heading: 'Report-Only Detection',
        body: 'Policies deployed from templates start in report-only mode and are often never enabled. The assessment flags checks that would pass if an existing report-only policy were turned on, and names the policy.',
      },
      {
        heading: 'Works with the Sandbox',
        body: 'The assessment evaluates your sandboxed policy set when sandbox mode is active. Promote a report-only policy in the sandbox and watch the check flip to Pass — verify the fix before touching your tenant.',
      },
    ],
  },
  {
    version: 'v0.5.0',
    subtitle: 'Policy Sandbox',
    features: [
      {
        heading: 'Sandbox Mode',
        body: 'Flip the new Sandbox switch in the header to experiment safely. Toggle any policy between On, Report-only, and Off and see the simulated effect across the entire app — without touching your tenant. A persistent bar tracks your changes, and Reset returns everything to live state.',
      },
      {
        heading: 'What If I Enabled This Policy?',
        body: 'Promote a report-only policy to enabled in the sandbox and watch it enter enforcement: the verdict, Matrix, Flow, Gaps, and Impact views all reflect the hypothetical state. The reverse works too — turn a policy off to preview the coverage you would lose.',
      },
      {
        heading: 'Sandbox vs Live Comparison',
        body: 'The View Diff panel sweeps all 5,760 scenarios through both your live and sandboxed policy sets, showing the posture score change, newly blocked and newly allowed scenarios, strengthened and weakened controls, and which user types are affected.',
      },
      {
        heading: 'Always Know Where You Are',
        body: 'Modified policies get a highlight ring and badge, every view carries a Sandbox chip while changes are active, and the verdict banner shows what your live tenant does today whenever the sandbox result differs.',
      },
    ],
  },
  {
    version: 'v0.4.3',
    subtitle: 'Accuracy & Analysis Refinements',
    features: [
      {
        heading: 'Full Device Filter Support',
        body: 'Device filter rules now support the complete grammar — parentheses, -and/-or combinations, and all ten operators — bringing evaluation in line with Entra behavior, including how unregistered devices are handled.',
      },
      {
        heading: 'More Grant Controls',
        body: 'Terms of Use and custom authentication factors are now recognized as grant controls and shown in evaluation results, and every-time sign-in frequency is carried through to the verdict.',
      },
      {
        heading: 'Sharper Gap & Impact Analysis',
        body: 'Analysis sweeps now distinguish controls a policy guarantees from OR alternatives it merely offers, credit session-only policies, and scope the all-apps dimension more precisely. Sweeps also complete faster on larger tenants. Numbers may shift compared to earlier versions — the new results reflect the corrected semantics.',
      },
      {
        heading: 'Complete App Discovery',
        body: 'Application discovery now retrieves the full list of enterprise apps and app registrations from larger tenants, and directory role names are resolved for policies targeting roles.',
      },
      {
        heading: 'Reduced Permissions',
        body: 'The delegated permission set has been trimmed to Policy.Read.All and Directory.Read.All — the simulator now requests only what it needs.',
      },
      {
        heading: 'UI Refinements',
        body: 'The Sankey view renders reliably on first visit, scenario settings persist when switching between views, user search handles rapid typing cleanly, and category icons have been refreshed.',
      },
    ],
  },
  {
    version: 'v0.4.2',
    subtitle: 'Startup Reliability',
    features: [
      {
        heading: 'Improved Startup Reliability',
        body: 'The app now renders immediately without waiting for authentication. Sample mode works with zero configuration, and MSAL initializes on-demand when you click Sign In.',
      },
    ],
  },
  {
    version: 'v0.4.1',
    subtitle: 'Bug Fixes & Improvements',
    features: [
      {
        heading: 'Sankey Diagram Sizing',
        body: 'Fixed an issue where the Sankey diagram could render with incorrect dimensions on first display, requiring a tab switch to correct itself.',
      },
      {
        heading: 'Other Fixes & Improvements',
        body: 'Improved silent token renewal reliability, fixed a failing Graph API call for app registrations, and general infrastructure hardening.',
      },
    ],
  },
  {
    version: 'v0.4.0',
    subtitle: 'Impact Analysis',
    features: [
      {
        heading: 'Impact Analysis Tab',
        body: 'New "What if I disabled this policy?" analysis. For every enabled policy, the engine removes it and re-evaluates all 5,760 scenario combinations to measure the effect. Policies are classified as Critical, High, Medium, or Low severity based on verdict changes, control loss, and fallback existence.',
      },
      {
        heading: 'Weighted Security Posture Score',
        body: 'Each scenario is scored 0-10 based on enforced controls (block=10, auth strength=5, MFA=3, device compliance=3, app protection=2). The overall percentage shows how your posture changes when a policy is removed. Click the info icon for the full scoring methodology.',
      },
      {
        heading: 'Contextual Fallback Analysis',
        body: 'When disabling a policy creates a gap, the tool identifies which other policies still provide protection. Fallback descriptions explain what remains and what is lost, including scope context like "MFA still required for most users, Office 365 (but device compliance no longer enforced)."',
      },
      {
        heading: 'Other Protection Active',
        body: 'Beyond direct fallbacks, the tool shows all other policies that still apply with different controls. This completes the three-tier view: red gaps, green fallbacks covering the same control, and blue cards showing other active protection.',
      },
      {
        heading: 'Affected Users Breakdown',
        body: 'Red and green pills show which user types (Standard Member, Guest User, Global Administrator) are affected vs unaffected by each policy removal, with scenario counts.',
      },
      {
        heading: 'Full-Width Analysis Views',
        body: 'The Gaps and Impact tabs now use full-width layouts since the simulation context panel is not relevant for sweep-based analysis. The Gaps view includes an inline user picker for persona selection.',
      },
    ],
  },
  {
    version: 'v0.3.4',
    subtitle: 'Tenant App Discovery',
    features: [
      {
        heading: 'Full Application Discovery',
        body: 'The Application dropdown now shows all enterprise applications and app registrations from your tenant — not just apps referenced in policies. Simulate sign-ins to any app to discover coverage gaps.',
      },
    ],
  },
  {
    version: 'v0.3.3',
    subtitle: 'Sample Policy Showcase',
    features: [
      {
        heading: 'Expanded Sample Policies',
        body: 'Three new sample policies (CA017-CA019) demonstrate custom authentication strengths, token protection, and session controls. Sample mode now showcases every engine feature out of the box.',
      },
    ],
  },
  {
    version: 'v0.3.2',
    subtitle: 'Engine Parity & Custom Auth Strength',
    features: [
      {
        heading: 'Custom Authentication Strengths',
        body: 'Admin-defined authentication strengths are now resolved via Graph API. Custom strengths are classified into tiers (MFA, Passwordless, Phishing-resistant) based on their allowed combinations.',
      },
      {
        heading: 'Insider Risk Conditions',
        body: 'Full support for policies targeting insider risk levels (minor, moderate, elevated). New condition matcher with direct list membership matching.',
      },
      {
        heading: 'Target Resource Modes',
        body: 'Simulate policies targeting User Actions (security info registration, device registration) and Authentication Contexts (C1-C3), not just cloud apps.',
      },
      {
        heading: 'Session Controls in Verdict',
        body: 'Aggregated session controls now appear in the verdict summary with source policy links. Token protection (secureSignInSession) is fully supported.',
      },
    ],
  },
  {
    version: 'v0.3.1',
    subtitle: 'Reliability & Code Quality',
    features: [
      {
        heading: 'Consistent Admin Consent Handling',
        body: 'Improved error handling when admin consent is required — the consent banner now appears consistently across all Graph API operations, including user resolution and app name lookups.',
      },
      {
        heading: 'Authentication Stability',
        body: 'Fixed a race condition in authentication initialization that could require signing in twice. The login event listener now registers before checking account state.',
      },
      {
        heading: 'Smarter API Retries',
        body: 'Improved retry reliability for rate-limited API requests. Each retry attempt now gets a fresh timeout, and retry sleeps are cancellable to prevent resource leaks.',
      },
      {
        heading: 'Session Control Accuracy',
        body: 'Cloud app security session controls now correctly pick the most restrictive type when multiple policies apply, matching the behavior of other session control aggregations.',
      },
      {
        heading: 'Accessibility',
        body: 'Screen reader support for icon buttons, search results, policy detail panel, and expandable sections. All interactive elements now have proper ARIA labels and roles.',
      },
      {
        heading: 'Internal Quality',
        body: 'Type-safe session controls pipeline, standardized condition phase naming, request deduplication for user resolution, and removed unused dependencies.',
      },
    ],
  },
  {
    version: 'v0.3',
    subtitle: 'Live Tenant & Stability Update',
    features: [
      {
        heading: 'Dynamic Data Switching',
        body: 'Switch between Sample Data and your Live Tenant at any time via the new Header toggle. Pivot your analysis without losing your place or refreshing the page.',
      },
      {
        heading: 'Reactive Identity Tracking',
        body: 'The interface now acknowledges your tenant connection the moment you sign in. No more "Not connected" ghost states\u2014see your environment context instantly.',
      },
      {
        heading: 'Resilient API Handling',
        body: 'Hardened integration with Microsoft Graph. The simulator now automatically handles API throttling (429 retries) and network timeouts, making it reliable even for massive enterprise tenants.',
      },
      {
        heading: 'Secure OData Sanitization',
        body: 'Under-the-hood security hardening for all tenant searches and lookups. Advanced escaping ensures your queries are safe and compatible with complex naming conventions.',
      },
      {
        heading: 'Session Persistence',
        body: 'A complete overhaul of the authentication architecture. The app now proactively manages your token lifecycle, keeping your session alive and your simulations uninterrupted.',
      },
    ],
  },
  {
    version: 'v0.2',
    subtitle: 'Gap Analysis & Advanced Conditions',
    features: [
      {
        heading: 'Gap Analysis',
        body: 'Sweep up to 5,760 scenario combinations to find blind spots in your policy set. Analyze by persona or run a generic sweep across all dimensions.',
      },
      {
        heading: 'Persona Mapping',
        body: 'Map 5 representative personas (Standard User, Admin, Guest, Break Glass, Service Account) to real tenant users for targeted gap analysis.',
      },
      {
        heading: 'Legacy Auth Detection',
        body: 'Identifies personas and apps not covered by legacy authentication blocking policies, including Exchange ActiveSync and Other (Legacy) client types.',
      },
      {
        heading: 'Authentication Flows',
        body: 'Evaluate policies that target specific authentication flows like device code flow, commonly used in phishing attacks.',
      },
      {
        heading: 'Report-Only Insights',
        body: "See what Report-Only policies would enforce if enabled. Microsoft's What If tool doesn't distinguish these.",
      },
    ],
  },
];

export function ReleaseNotesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>What's New</DialogTitle>
          <DialogDescription>
            Latest features and improvements
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 text-sm" style={{ color: COLORS.textMuted }}>
          {RELEASES.map((release, i) => (
            <div key={release.version}>
              {i > 0 && <hr className="mb-5 border-border" />}
              <h2 className="text-base font-bold mb-0.5" style={{ color: COLORS.text }}>
                {release.version}
              </h2>
              <p className="text-xs mb-3" style={{ color: COLORS.textDim }}>
                {release.subtitle}
              </p>
              <div className="space-y-3">
                {release.features.map((feature) => (
                  <div key={feature.heading}>
                    <h3 className="text-sm font-semibold mb-1" style={{ color: COLORS.text }}>
                      {feature.heading}
                    </h3>
                    <p>{feature.body}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
