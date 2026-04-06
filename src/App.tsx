import { useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthStore } from '@/stores/useAuthStore';

function App() {
  const initializeMsal = useAuthStore((s) => s.initializeMsal);

  useEffect(() => {
    // Auto-init MSAL when returning from a redirect (code/error in URL)
    // or when an existing session is in sessionStorage (page reload after login).
    // Auth response may arrive in query string (?code=) or hash fragment (#code=)
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    const hasRedirectParams = params.has('code') || params.has('error')
      || hash.includes('code=') || hash.includes('error=');
    const hasMsalSession = Object.keys(sessionStorage).some((k) => k.startsWith('msal.'));

    if (hasRedirectParams || hasMsalSession) {
      initializeMsal();
    }
  }, [initializeMsal]);

  return <AppLayout />;
}

export default App;
