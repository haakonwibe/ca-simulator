// data/theme.ts — Single source of truth for the application color system.
// CSS variables in index.css map these values into Shadcn's token system.

export const COLORS = {
  // Base
  bg: '#0a0e1a',
  bgCard: '#111827',
  bgCardHover: '#1a2236',
  bgPanel: '#0d1424',
  border: '#1e2a42',
  borderActive: '#3b82f6',
  text: '#e2e8f0',
  textMuted: '#64748b',
  textDim: '#475569',
  accent: '#3b82f6',
  accentGlow: 'rgba(59, 130, 246, 0.3)',

  // Evaluation outcomes
  granted: '#10b981',
  grantedGlow: 'rgba(16, 185, 129, 0.4)',
  grantedBg: 'rgba(16, 185, 129, 0.08)',
  blocked: '#ef4444',
  blockedGlow: 'rgba(239, 68, 68, 0.4)',
  blockedBg: 'rgba(239, 68, 68, 0.08)',
  mfa: '#f59e0b',
  mfaGlow: 'rgba(245, 158, 11, 0.4)',
  mfaBg: 'rgba(245, 158, 11, 0.08)',
  unsatisfied: '#f97316',
  unsatisfiedGlow: 'rgba(249, 115, 22, 0.4)',
  unsatisfiedBg: 'rgba(249, 115, 22, 0.08)',
  notApplicable: '#334155',
  notApplicableBg: 'rgba(51, 65, 85, 0.3)',
  reportOnly: '#3b82f6',
  reportOnlyGlow: 'rgba(59, 130, 246, 0.4)',
  reportOnlyBg: 'rgba(59, 130, 246, 0.08)',
  evaluating: '#8b5cf6',
  evaluatingGlow: 'rgba(139, 92, 246, 0.5)',

  // Policy categories
  identity: '#6366f1',
  security: '#ef4444',
  device: '#06b6d4',
  location: '#f97316',
  risk: '#ec4899',
  appProtection: '#8b5cf6',
  session: '#14b8a6',
} as const;

export const CATEGORY_META: Record<string, { color: string; icon: string; label: string }> = {
  identity:         { color: COLORS.identity,      icon: '\u{1F510}', label: 'Identity' },
  security:         { color: COLORS.security,      icon: '\u{1F6E1}', label: 'Security' },
  device:           { color: COLORS.device,        icon: '\u{1F4BB}', label: 'Device' },
  location:         { color: COLORS.location,      icon: '\u{1F4CD}', label: 'Location' },
  risk:             { color: COLORS.risk,           icon: '\u{26A1}',  label: 'Risk' },
  'app-protection': { color: COLORS.appProtection, icon: '\u{1F4F1}', label: 'App Protection' },
  session:          { color: COLORS.session,        icon: '\u{23F1}',  label: 'Session' },
};
