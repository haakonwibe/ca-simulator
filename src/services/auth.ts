// services/auth.ts — Centralized MSAL instance and token acquisition.
//
// Single source of truth for the MSAL PublicClientApplication instance and
// a getAccessToken() helper that handles silent acquisition with automatic
// redirect on InteractionRequiredAuthError.

import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { msalConfig, loginRequest } from '../authConfig';

export const msalInstance = new PublicClientApplication(msalConfig);

/**
 * Acquire an access token silently using the active MSAL account.
 * If the silent call fails due to expired session or missing consent,
 * automatically triggers a redirect-based login flow.
 */
export async function getAccessToken(): Promise<string> {
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
