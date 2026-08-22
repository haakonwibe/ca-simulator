// components/ExportChangesDialog.tsx — Change plan export (Summary / PowerShell / JSON).
//
// Artifacts are generated in-browser by lib/sandboxExport and offered as copy
// or file download — the app never writes to the tenant.

import { useMemo, useState } from 'react';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { COLORS } from '@/data/theme';
import { buildChangePlan, type ExportNewPolicyState } from '@/lib/sandboxExport';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Copy, Download, Check, ShieldAlert } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';

type ExportTab = 'summary' | 'powershell' | 'json';

const TABS: { key: ExportTab; label: string; filename: string; mime: string }[] = [
  { key: 'summary', label: 'Summary', filename: 'change-plan.md', mime: 'text/markdown' },
  { key: 'powershell', label: 'PowerShell', filename: 'deploy-changes.ps1', mime: 'text/plain' },
  { key: 'json', label: 'JSON', filename: 'policies.json', mime: 'application/json' },
];

export function ExportChangesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const livePolicies = usePolicyStore((s) => s.policies);
  const sandboxOverrides = usePolicyStore((s) => s.sandboxOverrides);
  const sandboxAssignments = usePolicyStore((s) => s.sandboxAssignments);
  const sandboxDrafts = usePolicyStore((s) => s.sandboxDrafts);
  const displayNames = usePolicyStore((s) => s.displayNames);

  const [activeTab, setActiveTab] = useState<ExportTab>('summary');
  const [newPolicyState, setNewPolicyState] = useState<ExportNewPolicyState>('disabled');
  const [copied, setCopied] = useState(false);

  const plan = useMemo(() => {
    if (!open) return null;
    return buildChangePlan(
      livePolicies,
      sandboxOverrides,
      sandboxAssignments,
      sandboxDrafts,
      displayNames,
      newPolicyState,
    );
  }, [open, livePolicies, sandboxOverrides, sandboxAssignments, sandboxDrafts, displayNames, newPolicyState]);

  if (!plan) {
    return <Dialog open={open} onOpenChange={onOpenChange} />;
  }

  const content: Record<ExportTab, string> = {
    summary: plan.summaryMarkdown,
    powershell: plan.powershellScript,
    json: plan.jsonDocument,
  };
  const activeContent = content[activeTab];
  const activeMeta = TABS.find((t) => t.key === activeTab)!;
  const hasCreations = plan.creations.length > 0;

  const handleCopy = async () => {
    trackEvent({ name: 'export', props: { format: activeTab, action: 'copy' } });
    await navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const handleDownload = () => {
    trackEvent({ name: 'export', props: { format: activeTab, action: 'download' } });
    const blob = new Blob([activeContent], { type: activeMeta.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeMeta.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export change plan</DialogTitle>
          <DialogDescription>
            {plan.modifications.length} {plan.modifications.length === 1 ? 'modification' : 'modifications'},{' '}
            {plan.creations.length} new {plan.creations.length === 1 ? 'policy' : 'policies'} — generated locally,
            nothing is sent to your tenant.
          </DialogDescription>
        </DialogHeader>

        {/* Safety banner */}
        <div
          className="flex items-start gap-2 rounded border px-3 py-2 text-xs"
          style={{ borderColor: 'rgba(217, 119, 6, 0.4)', backgroundColor: 'rgba(217, 119, 6, 0.08)', color: COLORS.textMuted }}
        >
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: COLORS.warning }} />
          <span>
            Review before deploying: verify break-glass exclusions and pilot first. New policies export in a
            non-enforcing state{hasCreations ? '' : ' (none in this plan)'}.
          </span>
        </div>

        {/* New policy state selector */}
        {hasCreations && (
          <div className="flex items-center gap-2 text-xs" style={{ color: COLORS.textMuted }}>
            <span>New policy state:</span>
            {(['disabled', 'enabledForReportingButNotEnforced'] as const).map((state) => {
              const active = newPolicyState === state;
              return (
                <button
                  key={state}
                  onClick={() => setNewPolicyState(state)}
                  className="rounded border px-2 py-0.5 text-[11px] transition-colors"
                  style={{
                    color: active ? COLORS.accentLight : COLORS.textMuted,
                    borderColor: active ? COLORS.accentLight : COLORS.border,
                    backgroundColor: active ? COLORS.selectedBg : 'transparent',
                  }}
                >
                  {state === 'disabled' ? 'Off (portal default)' : 'Report-only'}
                </button>
              );
            })}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="px-2.5 py-1.5 text-xs transition-colors"
              style={{
                color: activeTab === tab.key ? COLORS.text : COLORS.textMuted,
                boxShadow: activeTab === tab.key ? `inset 0 -2px 0 ${COLORS.accent}` : undefined,
              }}
            >
              {tab.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 pb-1">
            <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={handleCopy}>
              {copied ? <Check className="h-3 w-3" style={{ color: COLORS.granted }} /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={handleDownload}>
              <Download className="h-3 w-3" />
              {activeMeta.filename}
            </Button>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="h-[320px] rounded border" style={{ borderColor: COLORS.border, backgroundColor: COLORS.bgCard }}>
          <pre className="whitespace-pre-wrap p-3 font-mono text-[11px] leading-relaxed" style={{ color: COLORS.text }}>
            {activeContent}
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
