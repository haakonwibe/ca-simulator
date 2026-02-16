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
