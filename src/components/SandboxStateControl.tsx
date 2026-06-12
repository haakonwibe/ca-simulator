// components/SandboxStateControl.tsx — Three-state On/Report/Off segmented control.
// Rendered on policy tiles and in the detail panel while sandbox mode is active.

import { COLORS } from '@/data/theme';
import type { PolicyState } from '@/engine/models/Policy';

const OPTIONS: { value: PolicyState; label: string; title: string; color: string }[] = [
  { value: 'enabled', label: 'On', title: 'Enabled', color: COLORS.granted },
  { value: 'enabledForReportingButNotEnforced', label: 'RO', title: 'Report-only', color: COLORS.reportOnly },
  { value: 'disabled', label: 'Off', title: 'Disabled', color: COLORS.textDim },
];

export function SandboxStateControl({
  value,
  onChange,
}: {
  value: PolicyState;
  onChange: (state: PolicyState) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Sandbox policy state"
      className="inline-flex overflow-hidden rounded border"
      style={{ borderColor: COLORS.border, backgroundColor: COLORS.bgPanel }}
      onClick={(e) => e.stopPropagation()}
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.title}
            title={opt.title}
            className="cursor-pointer px-1.5 py-0.5 text-[9px] font-medium leading-none transition-colors"
            style={{
              color: active ? opt.color : COLORS.textDim,
              backgroundColor: active ? COLORS.selectedBg : 'transparent',
              boxShadow: active ? `inset 0 -1.5px 0 ${opt.color}` : undefined,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onChange(opt.value);
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
