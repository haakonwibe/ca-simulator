// main.tsx — Entry point.
// The app always mounts unconditionally. MSAL is initialized on-demand
// by useAuthStore when the user clicks "Sign In" or returns from a redirect.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { beforeSend, installErrorTracking } from './lib/analytics';
import App from './App';
import './index.css';

// MSAL renews tokens silently in a hidden iframe pointed at redirectUri, which
// is this app's own origin (frame-ancestors is 'self', so any framing parent is
// our own MSAL). Rendering the whole SPA in there costs a cold bundle load
// inside MSAL's 10-second budget — the difference between a renewal and a
// timed_out error on a slow first load. The parent only needs the response
// hash, which the browser puts in the frame's URL without any of our code
// running. Mounting nothing also keeps the iframe out of the page-view count.
if (window.parent === window) {
  installErrorTracking();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
      <Analytics beforeSend={beforeSend} />
    </StrictMode>,
  );
}
