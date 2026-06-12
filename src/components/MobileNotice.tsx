// components/MobileNotice.tsx — Narrow viewport notice overlay.

import { useState, useEffect } from 'react';
import { Monitor } from 'lucide-react';
import { COLORS } from '@/data/theme';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'ca-sim-mobile-dismissed';

export function MobileNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY)) return;

    const mq = window.matchMedia('(max-width: 767px)');
    // Re-check the dismissal flag on every change — crossing the breakpoint
    // after "Continue anyway" must not re-show the overlay
    const update = () => setShow(mq.matches && !sessionStorage.getItem(STORAGE_KEY));
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    sessionStorage.setItem(STORAGE_KEY, '1');
    setShow(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-8 text-center"
      style={{ backgroundColor: COLORS.bg }}
    >
      <Monitor className="h-10 w-10 mb-4" style={{ color: COLORS.textMuted }} />
      <p className="text-sm max-w-xs leading-relaxed mb-6" style={{ color: COLORS.textMuted }}>
        CA Simulator is designed for desktop use. For the best experience,
        please visit on a device with a wider screen.
      </p>
      <Button
        size="sm"
        className="text-white"
        style={{ backgroundColor: COLORS.accent }}
        onClick={dismiss}
      >
        Continue anyway
      </Button>
    </div>
  );
}
