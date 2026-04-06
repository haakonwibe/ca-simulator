// services/auth.ts — Centralized token acquisition.
//
// The MSAL instance is managed by useAuthStore (deferred initialization).
// This module exports getAccessToken() which reads the instance from the store.

import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { loginRequest } from '../authConfig';
import { useAuthStore } from '../stores/useAuthStore';

/**
 * Acquire an access token silently using the active MSAL account.
 * If the silent call fails due to expired session or missing consent,
 * automatically triggers a redirect-based login flow.
 */
export async function getAccessToken(): Promise<string> {
  const msalInstance = useAuthStore.getState().msalInstance;
  if (!msalInstance) throw new Error('MSAL not initialized');

  let account = msalInstance.getActiveAccount();
  if (!account) {
    // Fallback: account exists in cache but wasn't set as active (e.g. page refresh)
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      msalInstance.setActiveAccount(accounts[0]);
      account = accounts[0];
    }
  }
  if (!account) throw new Error('No active account');

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account,
    });
    return response.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      await msalInstance.acquireTokenRedirect(loginRequest);
      // acquireTokenRedirect navigates away — this line is never reached,
      // but we throw to satisfy the return type and signal callers.
      throw new Error('Redirecting to login');
    }
    throw error;
  }
}
