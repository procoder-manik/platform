'use client';

import { useEffect } from 'react';

/** Reports the missing address to the 404 log once per page view. */
export function LogMissing() {
  useEffect(() => {
    const body = JSON.stringify({ path: location.pathname, referrer: document.referrer || null });
    if (!navigator.sendBeacon?.('/api/404', new Blob([body], { type: 'application/json' }))) {
      void fetch('/api/404', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => undefined);
    }
  }, []);
  return null;
}
