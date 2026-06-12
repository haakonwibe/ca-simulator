// components/SandboxAssignmentEditor.tsx — Inline assignment editing (sandbox mode).
//
// Renders the editable chip rows in the PolicyDetailPanel: remove any existing
// entry (all four entity types, include and exclude), add users (search +
// special values) and applications (bundles + tenant apps). Groups and roles
// are remove-only in v0.7. Removed entries show as ghost chips with undo.

import { useState } from 'react';
import { usePolicyStore } from '@/stores/usePolicyStore';
import { COLORS } from '@/data/theme';
import {
  getAssignmentField,
  sameMembers,
  USER_ASSIGNMENT_FIELDS,
  APP_ASSIGNMENT_FIELDS,
  ASSIGNMENT_FIELD_LABELS,
  type AssignmentField,
} from '@/lib/sandbox';
import { resolveAssignmentEntryName } from '@/lib/sandboxDiff';
import { UserSearchInput } from '@/components/UserSearchInput';
import type { UserSearchResult } from '@/services/personaService';
import { APP_BUNDLES } from '@/data/appBundles';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { X, Plus, Undo2 } from 'lucide-react';
import type { ConditionalAccessPolicy } from '@/engine/models/Policy';

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Special values are exclusive of (or replace) other entries per Entra rules. */
function withValueAdded(current: string[], value: string): string[] {
  if (value === 'All' || value === 'None') return [value];
  const next = current.filter((v) => v !== 'All' && v !== 'None');
  return next.includes(value) ? next : [...next, value];
}

export function SandboxAssignmentEditor({ policyId }: { policyId: string }) {
  const livePolicies = usePolicyStore((s) => s.policies);
  const effectivePolicies = usePolicyStore((s) => s.effectivePolicies);
  const sandboxDrafts = usePolicyStore((s) => s.sandboxDrafts);

  const effective = effectivePolicies.find((p) => p.id === policyId);
  // Drafts have no live counterpart — the draft itself is the baseline
  const live = livePolicies.find((p) => p.id === policyId) ?? sandboxDrafts[policyId];
  if (!live || !effective) return null;

  return (
    <div className="px-4 pb-2 pt-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: COLORS.textDim }}>
        Edit Assignments
      </h4>
      <div className="space-y-2">
        {[...USER_ASSIGNMENT_FIELDS, ...APP_ASSIGNMENT_FIELDS].map((field) => (
          <FieldRow key={field} field={field} live={live} effective={effective} />
        ))}
      </div>
    </div>
  );
}

// ── Field row ───────────────────────────────────────────────────────

function FieldRow({
  field,
  live,
  effective,
}: {
  field: AssignmentField;
  live: ConditionalAccessPolicy;
  effective: ConditionalAccessPolicy;
}) {
  const displayNames = usePolicyStore((s) => s.displayNames);
  const setAssignmentOverride = usePolicyStore((s) => s.setAssignmentOverride);

  const liveValues = getAssignmentField(live, field);
  const effectiveValues = getAssignmentField(effective, field);
  const liveSet = new Set(liveValues);
  const effectiveSet = new Set(effectiveValues);
  const removed = liveValues.filter((v) => !effectiveSet.has(v));
  const isDeviating = !sameMembers(liveValues, effectiveValues);

  const isUserAddField = field === 'includeUsers' || field === 'excludeUsers';
  const isAppField = field === 'includeApplications' || field === 'excludeApplications';
  const entryKind = isAppField ? 'app' : 'user';
  const canAdd = isUserAddField || isAppField;

  // Hide rows with nothing to show or do (e.g. empty group/role lists)
  if (effectiveValues.length === 0 && removed.length === 0 && !canAdd) return null;

  const setValues = (values: string[]) => setAssignmentOverride(live.id, field, values);

  return (
    <div className="relative">
      <div className="mb-1 flex items-center justify-between">
        <span
          className="text-[10px] font-medium"
          style={{ color: isDeviating ? COLORS.accentLight : COLORS.textMuted }}
        >
          {ASSIGNMENT_FIELD_LABELS[field]}
          {isDeviating && ' · modified'}
        </span>
        {isUserAddField && <UserAddControl field={field} effectiveValues={effectiveValues} onAdd={setValues} />}
        {isAppField && <AppAddControl field={field} effectiveValues={effectiveValues} onAdd={setValues} />}
      </div>
      <div className="flex flex-wrap gap-1">
        {effectiveValues.length === 0 && removed.length === 0 && (
          <span className="text-[10px]" style={{ color: COLORS.textDim }}>None configured</span>
        )}
        {effectiveValues.map((value) => (
          <EntryChip
            key={value}
            value={value}
            name={resolveAssignmentEntryName(value, displayNames, entryKind)}
            isAdded={!liveSet.has(value)}
            onRemove={() => setValues(effectiveValues.filter((v) => v !== value))}
          />
        ))}
        {removed.map((value) => (
          <GhostChip
            key={value}
            name={resolveAssignmentEntryName(value, displayNames, entryKind)}
            onUndo={() => setValues(withValueAdded(effectiveValues, value))}
          />
        ))}
      </div>
    </div>
  );
}

// ── Chips ───────────────────────────────────────────────────────────

function chipTitle(value: string, name: string): string | undefined {
  return GUID_RE.test(value) && name === value ? value : undefined;
}

function shortName(value: string, name: string): string {
  // Unresolvable GUID — truncate, full id in tooltip
  if (GUID_RE.test(value) && name === value) return `${value.slice(0, 8)}…`;
  return name;
}

function EntryChip({
  value,
  name,
  isAdded,
  onRemove,
}: {
  value: string;
  name: string;
  isAdded: boolean;
  onRemove: () => void;
}) {
  const color = isAdded ? COLORS.accentLight : COLORS.text;
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]"
      style={{
        color,
        borderColor: isAdded ? COLORS.accentLight : COLORS.border,
        backgroundColor: isAdded ? COLORS.selectedBg : COLORS.bgCard,
      }}
      title={chipTitle(value, name)}
    >
      {shortName(value, name)}
      <button
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="rounded hover:bg-accent/50"
        style={{ color: COLORS.textMuted }}
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

function GhostChip({ name, onUndo }: { name: string; onUndo: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-dashed px-1.5 py-0.5 text-[10px] line-through"
      style={{ color: COLORS.textDim, borderColor: COLORS.border }}
    >
      {name}
      <button
        onClick={onUndo}
        aria-label={`Restore ${name}`}
        className="rounded hover:bg-accent/50 no-underline"
        style={{ color: COLORS.textMuted }}
        title="Restore"
      >
        <Undo2 className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

// ── Add controls ────────────────────────────────────────────────────

function AddButton({ onClick, expanded }: { onClick: () => void; expanded?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-5 gap-0.5 px-1.5 text-[10px]"
      style={{ color: expanded ? COLORS.accentLight : COLORS.textMuted }}
      onClick={onClick}
    >
      <Plus className="h-2.5 w-2.5" />
      Add
    </Button>
  );
}

function UserAddControl({
  field,
  effectiveValues,
  onAdd,
}: {
  field: AssignmentField;
  effectiveValues: string[];
  onAdd: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const mergeDisplayNames = usePolicyStore((s) => s.mergeDisplayNames);

  const handleSelect = (user: UserSearchResult) => {
    mergeDisplayNames({ [user.id]: user.displayName });
    onAdd(withValueAdded(effectiveValues, user.id));
    setOpen(false);
  };

  const quickAdd = (value: string) => {
    onAdd(withValueAdded(effectiveValues, value));
    setOpen(false);
  };

  // 'None' only makes sense in the include direction
  const specials = field === 'includeUsers'
    ? ['All', 'None', 'GuestsOrExternalUsers']
    : ['GuestsOrExternalUsers'];
  const available = specials.filter((s) => !effectiveValues.includes(s));

  if (!open) return <AddButton onClick={() => setOpen(true)} />;

  return (
    <div className="absolute left-0 right-0 top-5 z-20 rounded border p-2 shadow-md" style={{ borderColor: COLORS.border, backgroundColor: COLORS.bgPanel }}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px]" style={{ color: COLORS.textMuted }}>
          Add to {ASSIGNMENT_FIELD_LABELS[field].toLowerCase()}
        </span>
        <button onClick={() => setOpen(false)} aria-label="Close" style={{ color: COLORS.textMuted }}>
          <X className="h-3 w-3" />
        </button>
      </div>
      {available.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {available.map((value) => (
            <button
              key={value}
              onClick={() => quickAdd(value)}
              className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-accent/50"
              style={{ color: COLORS.accentLight, borderColor: COLORS.border }}
            >
              {resolveAssignmentEntryName(value)}
            </button>
          ))}
        </div>
      )}
      <UserSearchInput
        onSelect={handleSelect}
        placeholder="Search users to add..."
        inputClassName="h-7 pl-8 pr-8 text-[10px]"
      />
    </div>
  );
}

function AppAddControl({
  field,
  effectiveValues,
  onAdd,
}: {
  field: AssignmentField;
  effectiveValues: string[];
  onAdd: (values: string[]) => void;
}) {
  const tenantApplications = usePolicyStore((s) => s.tenantApplications);

  const options: { id: string; label: string }[] = [
    // 'All' only valid in the include direction
    ...(field === 'includeApplications' ? [{ id: 'All', label: 'All cloud apps' }] : []),
    ...APP_BUNDLES.map((b) => ({ id: b.id, label: b.displayName })),
    ...tenantApplications.map((app) => ({ id: app.appId, label: app.displayName })),
  ].filter((opt) => !effectiveValues.includes(opt.id));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 gap-0.5 px-1.5 text-[10px]"
          style={{ color: COLORS.textMuted }}
        >
          <Plus className="h-2.5 w-2.5" />
          Add
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.id}
            className="text-xs"
            onClick={() => onAdd(withValueAdded(effectiveValues, opt.id))}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
        {options.length === 0 && (
          <DropdownMenuItem disabled className="text-xs">
            Nothing left to add
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
