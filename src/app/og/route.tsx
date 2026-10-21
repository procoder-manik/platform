import { ImageResponse } from 'next/og';
import type { NextRequest } from 'next/server';
import { getSetting } from '@/lib/settings/store';
import { brandSettings } from '@/lib/theme/brand';
import { getPreset } from '@/lib/theme/presets';
import { resolvePalette } from '@/lib/theme/css';
import { siteSettings } from '@/modules/core/settings';

export const runtime = 'nodejs';

/** Automatic share image (1200 by 630) in the brand colours, used when a page has no image of its own. */
export async function GET(request: NextRequest) {
  const [site, brand] = await Promise.all([getSetting(siteSettings), getSetting(brandSettings)]);
  const palette = resolvePalette(getPreset(brand.preset).light, brand.light);
  const title = (request.nextUrl.searchParams.get('title') ?? site.siteName).slice(0, 140);
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: palette.base, color: palette.ink, borderTop: `16px solid ${palette.primary}` }}>
        <div style={{ fontSize: 30, color: palette.primary, fontWeight: 600 }}>{site.siteName}</div>
        <div style={{ fontSize: title.length > 70 ? 54 : 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}>{title}</div>
        <div style={{ fontSize: 26, color: palette.muted }}>{(process.env.SITE_URL ?? '').replace(/^https?:\/\//, '')}</div>
      </div>
    ),
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' } },
  );
}
