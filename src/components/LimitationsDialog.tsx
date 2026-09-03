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
          <Section title="Simplified matching">
            <ul className="space-y-2 mt-1">
              <LimitationItem>
                <strong>Device Filter rules</strong> — The full filter grammar is supported
                (parentheses, -and/-or, all ten operators). Rules that still fail to parse
                are treated as matching so the policy is not silently skipped.
              </LimitationItem>
              <LimitationItem>
                <strong>Authentication Strength</strong> — Built-in and custom strengths are
                resolved at the tier level (MFA, Passwordless, Phishing-resistant). Individual
                authentication methods (e.g. "user has a FIDO2 key") are not tracked, so a
                custom strength allowing one specific method is treated as its tier — any
                sign-in at that tier reads as satisfying it, where Entra would require the
                method itself. Built-in strengths are exact.
              </LimitationItem>
            </ul>
          </Section>

          <Section title="Resources and bundles">
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
            <ul className="space-y-2 mt-2">
              <LimitationItem>
                <strong>Microsoft Graph</strong> — evaluated as a plain resource. Entra treats it
                as an umbrella and evaluates the underlying service a Graph token is for, so a real
                sign-in may be judged against an Exchange or SharePoint policy that the simulator
                does not attribute to it.
              </LimitationItem>
              <LimitationItem>
                <strong>Baseline scopes</strong> — the simulator has never modelled the legacy
                exemption that let sign-ins requesting only baseline scopes bypass an All-resources
                policy that carries exclusions. Microsoft began removing that exemption in June
                2026, so results match the new behaviour, not a tenant that has opted to keep the
                old one.
              </LimitationItem>
              <LimitationItem>
                <strong>Application filters</strong> — policies that scope resources by a custom
                security attribute filter are not evaluated on that filter.
              </LimitationItem>
            </ul>
          </Section>

          <Section title="Agent identities">
            <ul className="space-y-2 mt-1">
              <LimitationItem>
                <strong>Agent attribute filters</strong> — Policies scoping agents by custom
                security attributes are displayed but the filter rule is not evaluated; matches
                are flagged "filter not evaluated" in the trace.
              </LimitationItem>
              <LimitationItem>
                <strong>Workload identities</strong> — Non-agent service principal targeting
                (includeServicePrincipals) is not simulated.
              </LimitationItem>
              <LimitationItem>
                <strong>Agent user scoping</strong> — Per Microsoft's documented behavior,
                "All users" and group membership do not cover agent user accounts; the
                simulator mirrors this.
              </LimitationItem>
              <LimitationItem>
                <strong>Beta schema</strong> — Agent policy details come from the beta Graph
                endpoint. If it is unavailable, policies load from v1.0 and agent targeting is
                invisible (a notice is shown).
              </LimitationItem>
            </ul>
          </Section>

          <Section title="Other notes">
            <ul className="space-y-2 mt-1">
              <LimitationItem>
                <strong>Authentication Context</strong> — Static C1/C2/C3 options in the
                simulator. Live tenants do not yet fetch tenant-defined authentication contexts
                from Graph API.
              </LimitationItem>
              <LimitationItem>
                <strong>Gap Analysis scope</strong> — Sweeps cloud app combinations only. User
                Actions and Authentication Context dimensions are not included in the sweep.
              </LimitationItem>
              <LimitationItem>
                <strong>Service Principal risk</strong> — Workload identity risk conditions
                (servicePrincipalRiskLevels) are not evaluated.
              </LimitationItem>
              <LimitationItem>
                <strong>Live guest users</strong> — Guests resolved from a live tenant are
                always classified as b2bCollaborationGuest (B2B direct connect, internal
                guests, and service provider users are not distinguished), and their home
                tenant ID is not resolved. Policies scoped to specific external tenants
                will therefore never match live guest personas.
              </LimitationItem>
              <LimitationItem>
                <strong>Remote Help</strong> — Conditional Access gates the helper's sign-in
                only. The target device's compliance is an informational banner inside Remote
                Help; no policy, real or simulated, can gate a session on it. The Baseline checks
                cover attended sessions on Windows and macOS, through browser and modern clients.
                An unattended session takes a different route: it signs in to Microsoft Graph
                rather than to Remote Assistance Service, so a policy naming that service does not
                reach it, and neither do these checks.
              </LimitationItem>
              <LimitationItem>
                <strong>Security info registration</strong> — Registering a method and browsing
                the My Sign-ins portal are different targets, and a policy is only ever in one
                mode. A policy on the portal does not cover a registration forced during sign-in
                to another app; the Register security information user action does not cover the
                portal itself. An All-resources policy is evaluated in both here. Microsoft does
                not document that combination.
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
