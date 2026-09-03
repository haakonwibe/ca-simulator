// services/auth.ts — Centralized token acquisition.
//
// The MSAL instance is managed by useAuthStore (deferred initialization).
// This module exports getAccessToken() which reads the instance from the store.

import { loginRequest } from '../authConfig';
import { useAuthStore } from '../stores/useAuthStore';
import { isSilentRenewalFailure } from '../lib/authErrors';

// Concurrent getAccessToken calls (e.g. policy load + persona resolution) can
// both hit a renewal failure; a second acquireTokenRedirect while the first is
// starting throws interaction_in_progress. Only the first caller triggers the
// redirect.
let redirectInProgress = false;

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
    // Interaction-required and a timed-out hidden iframe are the same situation
    // with and without an answer from Entra: the session is gone, so send the
    // user to sign in rather than surfacing an MSAL error code.
    if (isSilentRenewalFailure(error)) {
      if (!redirectInProgress) {
        redirectInProgress = true;
        await msalInstance.acquireTokenRedirect(loginRequest);
      }
      // acquireTokenRedirect navigates away — this line is reached only by
      // concurrent callers while the redirect is starting.
      throw new Error('Redirecting to login');
    }
    throw error;
  }
}
