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
    version: 'v0.4.2',
    subtitle: 'Startup Reliability',
    features: [
      {
        heading: 'Fixed Blank Page on Startup',
        body: 'The app no longer requires MSAL authentication to render. Previously, if VITE_MSAL_CLIENT_ID was missing or MSAL initialization failed, the entire page would be blank. Now the app always mounts and sample mode works with zero configuration. MSAL initializes on-demand when you click Sign In.',
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
