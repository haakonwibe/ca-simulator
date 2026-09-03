// lib/authErrors.ts — Classifying MSAL failures that mean "the user must sign in".
//
// Kept free of `window` and of the MSAL instance so it can be tested directly.

import {
  BrowserAuthError,
  BrowserAuthErrorCodes,
  InteractionRequiredAuthError,
} from '@azure/msal-browser';

/**
 * True when a silent token acquisition failed in a way only an interactive
 * sign-in can fix.
 *
 * `InteractionRequiredAuthError` is the tidy case: Entra answered and said so.
 * The timeouts are the same situation without an answer — when the Entra
 * session itself has lapsed, the hidden renewal iframe never receives a
 * response hash and MSAL gives up after its 10-second budget. Treating that as
 * a fatal error put a raw `timed_out` code in front of anyone returning to a
 * day-old tab, when what they needed was the sign-in page.
 */
export function isSilentRenewalFailure(error: unknown): boolean {
  if (error instanceof InteractionRequiredAuthError) return true;
  if (error instanceof BrowserAuthError) {
    return (
      error.errorCode === BrowserAuthErrorCodes.timedOut ||
      error.errorCode === BrowserAuthErrorCodes.iframeClosedPrematurely
    );
  }
  return false;
}
