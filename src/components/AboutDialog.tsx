// components/AboutDialog.tsx — "About CA Simulator" info dialog.

import { COLORS } from '@/data/theme';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const PERMISSIONS = [
  { name: 'Policy.Read.All', desc: 'Read Conditional Access policies' },
  { name: 'Application.Read.All', desc: 'Resolve application names' },
  { name: 'Directory.Read.All', desc: 'Resolve users, groups, and roles' },
  { name: 'User.Read.All', desc: 'Search users for persona mapping' },
  { name: 'GroupMember.Read.All', desc: 'Resolve group memberships' },
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
            This app runs entirely in your browser. No data is sent to any
            server — all communication happens directly between your browser and
            Microsoft's Graph API. Nothing is stored, logged, or transmitted to
            third parties.
          </Section>

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
              {' '}&middot; v0.2 beta &middot; MIT Licensed
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
