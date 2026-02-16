// components/ConsentBanner.tsx — Admin consent required banner.

import { ShieldAlert, FlaskConical, ExternalLink } from 'lucide-react';
import { COLORS } from '@/data/theme';
import { Button } from '@/components/ui/button';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { usePersonaStore } from '@/stores/usePersonaStore';
import { useEvaluationStore } from '@/stores/useEvaluationStore';
import type { SimulationContext } from '@/engine/models/SimulationContext';

const clientId = import.meta.env.VITE_MSAL_CLIENT_ID;
const adminConsentUrl = `https://login.microsoftonline.com/common/adminconsent?client_id=${clientId}&redirect_uri=${encodeURIComponent(window.location.origin)}`;

export function ConsentBanner() {
  const handleUseSampleData = () => {
    usePolicyStore.getState().loadSampleData();
    usePersonaStore.getState().resolveAndCacheSample('sample-user-1');
    const persona = usePersonaStore.getState().resolvedPersonas.get('sample-user-1');
    const policies = usePolicyStore.getState().policies;
    if (persona && policies.length > 0) {
      const context: SimulationContext = {
        user: persona,
        application: { appId: 'All', displayName: 'All Cloud Apps' },
        device: {},
        location: {},
        clientAppType: 'browser',
        risk: { signInRiskLevel: 'none', userRiskLevel: 'none', insiderRiskLevel: 'none' },
        satisfiedControls: [],
      };
      useEvaluationStore.getState().evaluate(policies, context);
    }
  };

  return (
    <div className="flex items-center justify-center h-full p-8">
      <div
        className="max-w-lg w-full rounded-lg border-l-4 p-6"
        style={{
          backgroundColor: COLORS.bgCard,
          borderLeftColor: '#d97706',
          borderTop: `1px solid ${COLORS.border}`,
          borderRight: `1px solid ${COLORS.border}`,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" style={{ color: '#d97706' }} />
          <div className="space-y-3">
            <h3 className="text-sm font-semibold" style={{ color: COLORS.text }}>
              Admin Consent Required
            </h3>

            <p className="text-sm leading-relaxed" style={{ color: COLORS.textMuted }}>
              The permissions required by CA Simulator (such as{' '}
              <code className="text-xs px-1 py-0.5 rounded" style={{ backgroundColor: 'rgba(59,130,246,0.1)', color: COLORS.accent }}>
                Policy.Read.All
              </code>
              ) require admin consent. Only tenant administrators can approve
              these permissions.
            </p>

            <div className="text-sm space-y-1.5" style={{ color: COLORS.textMuted }}>
              <p className="leading-relaxed">
                <span className="font-medium" style={{ color: COLORS.text }}>If you're an admin:</span>{' '}
                Sign out and sign in again — you should see a consent prompt.
              </p>
              <p className="leading-relaxed">
                <span className="font-medium" style={{ color: COLORS.text }}>If you're not an admin:</span>{' '}
                Ask your tenant administrator to grant consent using this link:
              </p>
            </div>

            <a
              href={adminConsentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded hover:underline"
              style={{
                color: COLORS.accent,
                backgroundColor: 'rgba(59,130,246,0.1)',
              }}
            >
              Admin consent link
              <ExternalLink className="h-3 w-3" />
            </a>

            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={handleUseSampleData}
              >
                <FlaskConical className="h-3.5 w-3.5" />
                Use Sample Data
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
