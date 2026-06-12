// components/AuthErrorBoundary.tsx — Auth error banner.
//
// Renders a dismissible banner when MSAL initialization fails.
// Implemented as a functional component (not a class-based error boundary)
// because MSAL failures are async and cannot be caught by React error boundaries.

import { useAuthStore } from '@/stores/useAuthStore';
import { COLORS } from '@/data/theme';
import { Button } from '@/components/ui/button';
import { AlertTriangle, X } from 'lucide-react';

export function AuthErrorBanner() {
  const authError = useAuthStore((s) => s.authError);
  const clearAuthError = useAuthStore((s) => s.clearAuthError);

  if (!authError) return null;

  return (
    <div
      className="flex items-center gap-3 border-b px-4 py-2 text-sm"
      style={{ borderColor: COLORS.border, backgroundColor: COLORS.blockedBg }}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: COLORS.blocked }} />
      <span className="flex-1" style={{ color: COLORS.text }}>
        {authError}
        {' '}You can continue using Sample Mode.
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 shrink-0"
        onClick={clearAuthError}
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" style={{ color: COLORS.textMuted }} />
      </Button>
    </div>
  );
}
