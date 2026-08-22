// components/AboutDialog.tsx — "About CA Simulator" info dialog.

import { useState } from 'react';
import { COLORS, APP_VERSION } from '@/data/theme';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { hasOptedOut, setOptedOut, isDoNotTrackEnabled } from '@/lib/analytics';

const PERMISSIONS = [
  { name: 'Policy.Read.All', desc: 'Read Conditional Access policies' },
  { name: 'Directory.Read.All', desc: 'Resolve users, groups, roles, and applications' },
];

export function AboutDialog({
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
          <DialogTitle>About CA Simulator</DialogTitle>
          <DialogDescription>
            Conditional Access policy evaluation and visualization
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm" style={{ color: COLORS.textMuted }}>
          <Section title="What is this?">
            CA Simulator evaluates Microsoft Entra ID Conditional Access policies
            against simulated sign-in scenarios. It helps IT admins understand
            which policies apply, which conditions matched or failed, and what
            controls are required — with three visualization modes: Grid, Matrix,
            and Flow.
          </Section>

          <Section title="Privacy & Security">
            This app runs entirely in your browser. Your tenant data — policies,
            users, groups, scenarios, and results — is never stored, logged, or
            transmitted to third parties. All communication happens directly
            between your browser and Microsoft's Graph API.
          </Section>

          <AnalyticsOptOut />

          <p style={{ color: COLORS.textMuted }}>
            The app registration requests read-only delegated permissions in your
            tenant. It cannot modify policies, users, or any other data. Your
            admin must explicitly consent before any access is granted.
          </p>

          <Section title="Permissions Used">
            <div className="mt-2 space-y-1.5">
              {PERMISSIONS.map((p) => (
                <div key={p.name} className="flex gap-2">
                  <code
                    className="shrink-0 text-xs px-1.5 py-0.5 rounded"
                    style={{ color: COLORS.accent, backgroundColor: 'rgba(59,130,246,0.1)' }}
                  >
                    {p.name}
                  </code>
                  <span className="text-xs" style={{ color: COLORS.textDim }}>
                    {p.desc}
                  </span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Sample Mode">
            You can explore the simulator without signing in using built-in
            sample data. Click "Use Sample Data" to try it instantly — no tenant
            connection required.
          </Section>

          <div className="pt-2 border-t" style={{ borderColor: COLORS.border }}>
            <p className="text-xs" style={{ color: COLORS.textDim }}>
              Built by{' '}
              <a
                href="https://x.com/haakonwibe"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ color: COLORS.accent }}
              >
                Haakon Wibe
              </a>
              {' '}&middot; {APP_VERSION} &middot; MIT Licensed
              {' '}&middot;{' '}
              <a href="/privacy" className="hover:underline" style={{ color: COLORS.accent }}>
                Privacy
              </a>
              {' '}&middot;{' '}
              <a href="/terms" className="hover:underline" style={{ color: COLORS.accent }}>
                Terms
              </a>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Anonymous usage events are on by default and describe interactions only —
 * which tab was opened, sample or live mode, whether an export happened. Do Not
 * Track overrides the switch, so the UI reflects that rather than claiming
 * events are being sent when they are not.
 */
function AnalyticsOptOut() {
  const dnt = isDoNotTrackEnabled();
  const [enabled, setEnabled] = useState(() => !hasOptedOut());

  const toggle = (next: boolean) => {
    setOptedOut(!next);
    setEnabled(next);
  };

  return (
    <div className="flex items-start justify-between gap-4 rounded border px-3 py-2" style={{ borderColor: COLORS.border }}>
      <div>
        <div className="text-xs font-medium" style={{ color: COLORS.text }}>
          Send anonymous usage events
        </div>
        <p className="mt-0.5 text-xs" style={{ color: COLORS.textDim }}>
          {dnt
            ? 'Disabled — your browser sends Do Not Track.'
            : 'Which tab you open, sample or live mode, and whether you export. Never policy names, identifiers, or tenant data.'}
        </p>
      </div>
      <Switch
        checked={!dnt && enabled}
        disabled={dnt}
        onCheckedChange={toggle}
        aria-label="Send anonymous usage events"
      />
    </div>
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
      {typeof children === 'string' ? (
        <p>{children}</p>
      ) : (
        children
      )}
    </div>
  );
}
