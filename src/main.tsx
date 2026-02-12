// main.tsx — Entry point following Microsoft's official React SPA tutorial.
// MSAL instance is created and initialized outside the component tree.
// https://learn.microsoft.com/en-us/entra/identity-platform/tutorial-single-page-app-react-configure-authentication

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EventType } from '@azure/msal-browser';
import type { EventMessage, AuthenticationResult } from '@azure/msal-browser';
import { MsalProvider } from '@azure/msal-react';
import { msalInstance } from './services/auth';
import { Analytics } from '@vercel/analytics/react';
import { usePolicyStore } from './stores/usePolicyStore';
import App from './App';
import './index.css';

msalInstance.initialize().then(() => {
  // Default to using the first account if no account is active on page load
  if (!msalInstance.getActiveAccount() && msalInstance.getAllAccounts().length > 0) {
    msalInstance.setActiveAccount(msalInstance.getAllAccounts()[0]);
  }

  // Listen for sign-in event and set active account
  msalInstance.addEventCallback((event: EventMessage) => {
    if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
      const payload = event.payload as AuthenticationResult;
      msalInstance.setActiveAccount(payload.account);
      usePolicyStore.getState().loadTenantName();
    }
  });

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
        <Analytics />
      </MsalProvider>
    </StrictMode>,
  );
});
