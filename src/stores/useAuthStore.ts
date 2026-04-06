// stores/useAuthStore.ts — Zustand store for deferred MSAL lifecycle.
//
// MSAL is NOT initialized at module scope. The app always mounts and renders
// sample mode. MSAL is created on-demand when the user clicks "Sign In" or
// when the app detects a redirect return (code/error in URL params).

import { create } from 'zustand';
import {
  PublicClientApplication,
  EventType,
} from '@azure/msal-browser';
import type { EventMessage, AuthenticationResult, AccountInfo } from '@azure/msal-browser';
import { msalConfig, loginRequest } from '../authConfig';
import { usePolicyStore } from './usePolicyStore';
import { usePersonaStore } from './usePersonaStore';
import { useEvaluationStore } from './useEvaluationStore';

interface AuthState {
  msalInstance: PublicClientApplication | null;
  isInitialized: boolean;
  isInitializing: boolean;
  authError: string | null;
  accounts: AccountInfo[];
  isAuthenticated: boolean;

  // Actions
  initializeMsal: () => Promise<void>;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  clearAuthError: () => void;
}

// Single in-flight init promise to prevent concurrent initialization
let initPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  msalInstance: null,
  isInitialized: false,
  isInitializing: false,
  authError: null,
  accounts: [],
  isAuthenticated: false,

  initializeMsal: async () => {
    const { isInitialized, isInitializing } = get();
    if (isInitialized || isInitializing) {
      // If already initializing, wait for the in-flight promise
      if (initPromise) await initPromise;
      return;
    }

    const clientId = import.meta.env.VITE_MSAL_CLIENT_ID;
    if (!clientId) {
      set({
        authError:
          'Missing MSAL configuration. Set VITE_MSAL_CLIENT_ID in a .env file to connect to a live tenant. See README.',
      });
      return;
    }

    set({ isInitializing: true, authError: null });

    initPromise = (async () => {
      try {
        const instance = new PublicClientApplication(msalConfig);
        await instance.initialize();

        // Register event callback BEFORE handleRedirectPromise to avoid
        // missing LOGIN_SUCCESS (same ordering as the previous main.tsx)
        instance.addEventCallback((event: EventMessage) => {
          if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
            const payload = event.payload as AuthenticationResult;
            instance.setActiveAccount(payload.account);
            set({
              accounts: instance.getAllAccounts(),
              isAuthenticated: true,
            });
          }
        });

        // Process any pending redirect response
        await instance.handleRedirectPromise();

        // Default to using the first account if no account is active
        if (!instance.getActiveAccount() && instance.getAllAccounts().length > 0) {
          instance.setActiveAccount(instance.getAllAccounts()[0]);
        }

        const accounts = instance.getAllAccounts();
        set({
          msalInstance: instance,
          isInitialized: true,
          accounts,
          isAuthenticated: accounts.length > 0,
        });
      } catch (error) {
        set({
          authError: error instanceof Error ? error.message : 'MSAL initialization failed',
        });
      } finally {
        set({ isInitializing: false });
        initPromise = null;
      }
    })();

    await initPromise;
  },

  login: async () => {
    if (!get().isInitialized) {
      await get().initializeMsal();
    }
    const instance = get().msalInstance;
    if (!instance) return; // initializeMsal failed — authError already set
    await instance.loginRedirect(loginRequest);
  },

  logout: async () => {
    const instance = get().msalInstance;
    if (!instance) return;
    // Clear all stores before redirect (prevents stale tenant data)
    usePolicyStore.getState().clear();
    usePersonaStore.getState().clear();
    useEvaluationStore.getState().clear();
    await instance.logoutRedirect();
  },

  clearAuthError: () => {
    set({ authError: null });
  },
}));
