// main.tsx — Entry point.
// The app always mounts unconditionally. MSAL is initialized on-demand
// by useAuthStore when the user clicks "Sign In" or returns from a redirect.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import { beforeSend, installErrorTracking } from './lib/analytics';
import App from './App';
import './index.css';

installErrorTracking();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Analytics beforeSend={beforeSend} />
  </StrictMode>,
);
