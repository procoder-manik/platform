import 'server-only';
import { headers } from 'next/headers';

/** Hosts the site may be reached on: the configured address plus ALLOWED_HOSTS (comma separated). */
function knownHosts(): Set<string> {
  const hosts = new Set<string>();
  try {
    if (process.env.SITE_URL) hosts.add(new URL(process.env.SITE_URL).host);
  } catch {
    /* ignored: validated by the health check */
  }
  for (const h of (process.env.ALLOWED_HOSTS ?? '').split(',').map((x) => x.trim()).filter(Boolean)) hosts.add(h);
  if (process.env.NODE_ENV !== 'production') hosts.add('localhost:3000').add('localhost:3001');
  return hosts;
}

const isLocal = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);

/**
 * The address of the running site for links in emails and gateway returns. The request host is trusted
 * only when it is a known host, so a forged Host header cannot point links elsewhere. Background jobs
 * (no request) use SITE_URL, and a localhost address is ignored in production.
 */
export async function baseUrl(): Promise<string> {
  const configured = (process.env.SITE_URL ?? '').replace(/\/$/, '');
  const usable = configured && !(process.env.NODE_ENV === 'production' && isLocal(configured)) ? configured : '';
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (host && knownHosts().has(host)) {
      const proto = h.get('x-forwarded-proto') ?? (isLocal(`http://${host}`) ? 'http' : 'https');
      return `${proto}://${host}`;
    }
  } catch {
    /* no request context: background job */
  }
  return usable || 'http://localhost:3000';
}
