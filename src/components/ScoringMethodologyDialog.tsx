// components/ScoringMethodologyDialog.tsx — Explains the security posture scoring methodology.

import { COLORS } from '@/data/theme';
import {
  CONTROL_WEIGHTS,
  AUTH_STRENGTH_WEIGHT,
  SESSION_SIGN_IN_FREQUENCY_WEIGHT,
  MAX_POSTURE_SCORE,
} from '@/lib/impactAnalysis';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const WEIGHT_ROWS: { label: string; points: number; note: string }[] = [
  { label: 'Block', points: CONTROL_WEIGHTS.block, note: 'Access denied \u2014 maximum score' },
  { label: 'Authentication Strength', points: AUTH_STRENGTH_WEIGHT, note: 'Phishing-resistant / passwordless' },
  { label: 'Multifactor Authentication', points: CONTROL_WEIGHTS.mfa, note: 'Standard MFA' },
  { label: 'Compliant Device', points: CONTROL_WEIGHTS.compliantDevice, note: 'MDM-enrolled device' },
  { label: 'Hybrid Azure AD Join', points: CONTROL_WEIGHTS.domainJoinedDevice, note: 'Domain-joined device' },
  { label: 'Approved Application', points: CONTROL_WEIGHTS.approvedApplication, note: 'MAM app requirement' },
  { label: 'App Protection Policy', points: CONTROL_WEIGHTS.compliantApplication, note: 'Intune app protection' },
  { label: 'Password Change', points: CONTROL_WEIGHTS.passwordChange, note: 'Forced password reset' },
  { label: 'Sign-in Frequency', points: SESSION_SIGN_IN_FREQUENCY_WEIGHT, note: 'Session control' },
];

export function ScoringMethodologyDialog({
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
          <DialogTitle>Security Posture Scoring</DialogTitle>
          <DialogDescription>
            How the policy coverage score is calculated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm" style={{ color: COLORS.textMuted }}>
          <Section title="How it works">
            <p>
              Each scenario in the sweep gets a security posture score from 0 to {MAX_POSTURE_SCORE} based
              on what controls are enforced. The overall percentage is the average score across all
              scenarios, normalized to 100%. A higher score means stronger protection.
            </p>
          </Section>

          <Section title="Control weights">
            <div className="mt-2 rounded-lg border overflow-hidden" style={{ borderColor: COLORS.border }}>
              {/* Header row */}
              <div
                className="grid grid-cols-[1fr_60px_1fr] gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: COLORS.textDim, backgroundColor: COLORS.bgCard }}
              >
                <span>Control</span>
                <span className="text-center">Points</span>
                <span>Notes</span>
              </div>
              {WEIGHT_ROWS.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[1fr_60px_1fr] gap-2 border-t px-3 py-2 items-center"
                  style={{ borderColor: COLORS.border }}
                >
                  <span className="text-xs" style={{ color: COLORS.text }}>{row.label}</span>
                  <span
                    className="text-center text-xs font-bold"
                    style={{ color: COLORS.accent }}
                  >
                    {row.points}
                  </span>
                  <span className="text-[11px]" style={{ color: COLORS.textDim }}>{row.note}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Stacking rules">
            <ul className="space-y-2 mt-1">
              <BulletItem>
                Authentication Strength and MFA don't stack — the stronger one is used ({AUTH_STRENGTH_WEIGHT} or {CONTROL_WEIGHTS.mfa})
              </BulletItem>
              <BulletItem>
                Compliant Device and Hybrid Azure AD Join don't stack — only the first matched is counted
              </BulletItem>
              <BulletItem>
                Block is always {MAX_POSTURE_SCORE}/{MAX_POSTURE_SCORE} regardless of other controls
              </BulletItem>
              <BulletItem>
                Maximum score per scenario is capped at {MAX_POSTURE_SCORE}
              </BulletItem>
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

function BulletItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="list-none">
      <span style={{ color: COLORS.textDim }}>&bull;</span>{' '}
      {children}
    </li>
  );
}
