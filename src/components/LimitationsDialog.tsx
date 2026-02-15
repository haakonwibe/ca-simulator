// components/LimitationsDialog.tsx — "Known Limitations" info dialog.

import { COLORS } from '@/data/theme';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export function LimitationsDialog({
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
          <DialogTitle>Known Limitations</DialogTitle>
          <DialogDescription>
            CA Simulator is under active development. The following limitations are known.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm" style={{ color: COLORS.textMuted }}>
          <Section title="Not yet implemented">
            <ul className="space-y-2 mt-1">
              <LimitationItem>
                <strong>Session Controls</strong> — Sign-in frequency, persistent browser, cloud app
                security, and continuous access evaluation conditions are evaluated by the engine but
                not displayed in the results UI.
              </LimitationItem>
              <LimitationItem>
                <strong>Authentication Strength</strong> — The three built-in strengths
                (Multifactor authentication, Passwordless MFA, Phishing-resistant MFA) are fully
                resolved with hierarchy-based matching. Custom authentication strengths
                (admin-defined) are displayed but always show as unsatisfied. The simulator
                resolves at the strength tier level only — individual authentication methods are
                not tracked.
              </LimitationItem>
              <LimitationItem>
                <strong>Device Filter rules</strong> — Complex device filter expressions (e.g.{' '}
                <code className="text-xs px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: COLORS.accent }}>
                  device.model -startsWith "Surface"
                </code>
                ) use simplified matching. A full expression parser is planned.
              </LimitationItem>
              <LimitationItem>
                <strong>Insider Risk conditions</strong> — Not yet supported by the engine.
              </LimitationItem>
              <LimitationItem>
                <strong>Token Protection</strong> — Not yet supported by the engine.
              </LimitationItem>
            </ul>
          </Section>

          <Section title="App bundle accuracy">
            <p>
              The built-in app bundles Office365 and MicrosoftAdminPortals are based on verified
              app IDs from tenant queries and sign-in log tracing. However, Microsoft does not
              publicly document the exact bundle membership. Some edge-case applications may not
              match as expected.
            </p>
            <p className="mt-2">
              The MicrosoftAdminPortals bundle is notably narrower in practice than Microsoft's
              documentation implies — most admin centers authenticate through the Office 365 Shell
              rather than their own app registrations.
            </p>
          </Section>

          <Section title="Other notes">
            <ul className="space-y-2 mt-1">
              <LimitationItem>
                Guest and external user sub-type matching handles common types
                (b2bCollaborationGuest) but granular tenant-scoped external user conditions may
                not fully evaluate.
              </LimitationItem>
              <LimitationItem>
                Named location matching requires manual selection (Trusted/Untrusted) — no
                IP-based geolocation is performed.
              </LimitationItem>
              <LimitationItem>
                Report-only policies are fully evaluated and displayed separately. This differs
                from Microsoft's What If tool, which groups them under "Does not apply" without
                distinguishing policies that would have applied.
              </LimitationItem>
            </ul>
          </Section>

          <div className="pt-2 border-t" style={{ borderColor: COLORS.border }}>
            <p className="text-xs" style={{ color: COLORS.textDim }}>
              Have feedback?{' '}
              <a
                href="https://x.com/haakonwibe"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ color: COLORS.accent }}
              >
                Reach out on X
              </a>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-1" style={{ color: COLORS.text }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function LimitationItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="list-none">
      <span style={{ color: COLORS.textDim }}>&bull;</span>{' '}
      {children}
    </li>
  );
}
