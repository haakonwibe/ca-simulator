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
