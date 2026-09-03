// lib/__tests__/authErrors.test.ts — Silent renewal failure classification.
//
// Uses MSAL's real error classes: the point is the instanceof checks and the
// error codes, which a hand-rolled fake would not exercise.

import { describe, it, expect } from 'vitest';
import { BrowserAuthError, BrowserAuthErrorCodes, InteractionRequiredAuthError } from '@azure/msal-browser';
import { isSilentRenewalFailure } from '../authErrors';

describe('isSilentRenewalFailure', () => {
  it('treats interaction_required as a sign-in trigger', () => {
    expect(isSilentRenewalFailure(new InteractionRequiredAuthError('interaction_required'))).toBe(true);
  });

  it('treats a renewal frame that timed out or closed early the same way', () => {
    expect(isSilentRenewalFailure(new BrowserAuthError(BrowserAuthErrorCodes.timedOut))).toBe(true);
    expect(isSilentRenewalFailure(new BrowserAuthError(BrowserAuthErrorCodes.iframeClosedPrematurely))).toBe(true);
  });

  it('leaves other browser errors alone — a redirect during interaction_in_progress would loop', () => {
    expect(isSilentRenewalFailure(new BrowserAuthError(BrowserAuthErrorCodes.interactionInProgress))).toBe(false);
    expect(isSilentRenewalFailure(new BrowserAuthError(BrowserAuthErrorCodes.redirectInIframe))).toBe(false);
  });

  it('ignores non-MSAL errors', () => {
    expect(isSilentRenewalFailure(new Error('timed_out'))).toBe(false);
    expect(isSilentRenewalFailure(undefined)).toBe(false);
  });
});
