// components/ResultsTipsDialog.tsx — "Understanding Your Results" info dialog.

import { COLORS } from '@/data/theme';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

const TIPS = [
  {
    heading: '"Location: Any" includes untrusted locations',
    body: 'Setting Location to "Any" means both Trusted and Untrusted locations are evaluated. If a policy blocks untrusted locations, you may see a Block result even when MFA and device compliance are satisfied. Try setting Location to "Trusted" to see how the result changes.',
  },
  {
    heading: '"All Cloud Apps" triggers every app-scoped policy',
    body: 'Evaluating against "All Cloud Apps" means every policy with an app condition will be checked. A policy targeting only Microsoft Admin Portals will apply, even if you didn\'t intend to test admin portal access.',
  },
  {
    heading: 'Report-Only policies don\'t affect the verdict',
    body: 'Policies in Report-Only mode are evaluated but never enforce. The CA Simulator shows what they would do if enabled — Microsoft\'s What If tool does not distinguish these.',
  },
  {
    heading: 'Block always wins',
    body: 'If any single enabled policy results in Block, the final verdict is Block — regardless of how many other policies grant access. This is by design in Conditional Access.',
  },
  {
    heading: 'Gap Analysis sweeps all combinations',
    body: 'The Gaps tab tests every combination of platform, client app, location, and risk level. A finding doesn\'t mean you\'re vulnerable right now — it means a specific combination of conditions has no policy coverage.',
  },
];

export function ResultsTipsDialog({
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
          <DialogTitle>Understanding Your Results</DialogTitle>
          <DialogDescription>
            Evaluation results that are technically correct but may seem counterintuitive.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm" style={{ color: COLORS.textMuted }}>
          {TIPS.map((tip) => (
            <div key={tip.heading}>
              <h3 className="text-sm font-semibold mb-1" style={{ color: COLORS.text }}>
                {tip.heading}
              </h3>
              <p>{tip.body}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
