// authConfig.ts
 
// MSAL configuration for silent token acquisition and caching.
// Reference: https://learn.microsoft.com/en-us/entra/identity-platform/msal-acquire-cache-tokens

import { LogLevel } from '@azure/msal-browser';

export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID,
    authority: 'https://login.microsoftonline.com/organizations',
    redirectUri: window.location.origin,
    postLogoutRedirectUri: '/',
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: 'sessionStorage' as const,
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level: LogLevel, message: string, containsPii: boolean) => {
        if (containsPii) return;
        if (level === LogLevel.Error) console.error(message);
        else if (level === LogLevel.Warning) console.warn(message);
      },
    },
  },
};

/**
 * Scopes for Graph API access.
 * MSAL.js automatically adds OIDC scopes (openid, profile, email).
 */
export const loginRequest = {
  scopes: [
    'Policy.Read.All',
    'Application.Read.All',
    'Directory.Read.All',
    'User.Read.All',
    'GroupMember.Read.All',
  ],
};
