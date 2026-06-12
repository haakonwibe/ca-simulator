// data/theme.ts — Single source of truth for the application color system.
// CSS variables in index.css map these values into Shadcn's token system.

import { KeyRound, Shield, Laptop, MapPin, Zap, Smartphone, Timer, type LucideIcon } from 'lucide-react';

export const APP_VERSION = 'v0.6.2 beta';

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
  accentLight: '#60a5fa',
  accentLightFaded: 'rgba(96, 165, 250, 0.5)',
  selectedBg: 'rgba(59, 130, 246, 0.06)',
  warning: '#d97706',

  // Evaluation outcomes
  granted: '#10b981',
  grantedGlow: 'rgba(16, 185, 129, 0.4)',
  grantedBg: 'rgba(16, 185, 129, 0.08)',
  blocked: '#ef4444',
  blockedGlow: 'rgba(239, 68, 68, 0.4)',
  blockedBg: 'rgba(239, 68, 68, 0.08)',
  blockedBorder: 'rgba(239, 68, 68, 0.3)',
  mfa: '#f59e0b',
  mfaGlow: 'rgba(245, 158, 11, 0.4)',
  mfaBg: 'rgba(245, 158, 11, 0.08)',
  mfaBorder: 'rgba(245, 158, 11, 0.3)',
  unsatisfied: '#f97316',
  unsatisfiedGlow: 'rgba(249, 115, 22, 0.4)',
  unsatisfiedBg: 'rgba(249, 115, 22, 0.08)',
  unsatisfiedBorder: 'rgba(249, 115, 22, 0.3)',
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

export const CATEGORY_META: Record<string, { color: string; icon: LucideIcon; label: string }> = {
  identity:         { color: COLORS.identity,      icon: KeyRound,   label: 'Identity' },
  security:         { color: COLORS.security,      icon: Shield,     label: 'Security' },
  device:           { color: COLORS.device,        icon: Laptop,     label: 'Device' },
  location:         { color: COLORS.location,      icon: MapPin,     label: 'Location' },
  risk:             { color: COLORS.risk,           icon: Zap,        label: 'Risk' },
  'app-protection': { color: COLORS.appProtection, icon: Smartphone, label: 'App Protection' },
  session:          { color: COLORS.session,        icon: Timer,      label: 'Session' },
};
