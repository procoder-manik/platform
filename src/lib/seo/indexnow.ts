import 'server-only';
import { createHmac } from 'node:crypto';
import { getSetting } from '@/lib/settings/store';
import { seoSettings } from './settings';

/** The IndexNow key: the one saved in SEO settings, or one derived from AUTH_SECRET so it stays stable. */
export async function indexNowKey(): Promise<string> {
  const seo = await getSetting(seoSettings);
  return seo.indexNowKey || createHmac('sha256', process.env.AUTH_SECRET ?? 'key').update('indexnow').digest('hex').slice(0, 32);
}

/**
 * Tells IndexNow (Bing, Yandex, Seznam and others) about changed addresses. Only on the live site, never
 * while the staging switch is on, and never blocking the save: failures are logged.
 */
export async function pingIndexNow(paths: string[]): Promise<void> {
  try {
    const seo = await getSetting(seoSettings);
    const base = (process.env.SITE_URL ?? '').replace(/\/$/, '');
    if (!seo.indexNow || seo.staging || !base.startsWith('https://') || process.env.NODE_ENV !== 'production') return;
    const host = new URL(base).host;
    const key = await indexNowKey();
    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation: `${base}/indexnow.txt`, urlList: [...new Set(paths)].map((p) => `${base}${p}`) }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok && response.status !== 202) console.warn('[indexnow] answered', response.status);
  } catch (error) {
    console.warn('[indexnow] ping failed', error);
  }
}
