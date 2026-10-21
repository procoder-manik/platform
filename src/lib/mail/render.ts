import { COLOR_TOKENS, getPreset } from '@/lib/theme/presets';
import { resolvePalette } from '@/lib/theme/css';
import type { BrandSettings } from '@/lib/theme/brand';
import { fill, type EmailTemplate, type Placeholder } from './templates';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const linkify = (escaped: string) => escaped.replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" style="color:inherit">${u}</a>`);

export interface EmailBrand {
  siteName: string;
  logoUrl: string | null;
  primary: string;
  primaryInk: string;
  ink: string;
  body: string;
  base: string;
  line: string;
  address: string;
  signature: string;
}

export function emailBrand(brand: BrandSettings, siteName: string, base: string, extra: { address?: string; signature?: string } = {}): EmailBrand {
  const p = resolvePalette(getPreset(brand.preset).light, brand.light);
  void COLOR_TOKENS;
  const logo = brand.logoLight ? (brand.logoLight.startsWith('http') ? brand.logoLight : `${base}${brand.logoLight}`) : null;
  return { siteName, logoUrl: logo && !/\.svg(\?|$)/i.test(logo) ? logo : null, primary: p.primary, primaryInk: p.primaryInk, ink: p.ink, body: p.body, base: p.base, line: p.line, address: extra.address ?? '', signature: extra.signature ?? siteName };
}

/** One branded layout for every email. Web-safe fonts only, because mail apps ignore web fonts. A plain-text version always comes with it. Takes the template's actual text (a saved override, or the code default), never an id, so a live preview can render edits before they are saved. */
export function renderEmail(t: Pick<EmailTemplate, 'subject' | 'body' | 'cta'>, vars: Partial<Record<Placeholder, string>>, brand: EmailBrand): { subject: string; html: string; text: string } {
  const subject = fill(t.subject, vars);
  const body = fill(t.body, vars);
  const link = vars.link ?? '';
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const cta = t.cta && link ? { label: t.cta, href: link } : null;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;background:${brand.base};font-family:Arial,Helvetica,sans-serif;color:${brand.body};line-height:1.6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.base}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${brand.line};border-radius:10px">
<tr><td style="padding:24px 28px;border-bottom:1px solid ${brand.line}">${brand.logoUrl ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.siteName)}" height="32" style="display:block;height:32px;width:auto">` : `<span style="font-size:20px;font-weight:bold;color:${brand.ink}">${esc(brand.siteName)}</span>`}</td></tr>
<tr><td style="padding:28px">${paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:16px">${linkify(esc(p)).replace(/\n/g, '<br>')}</p>`).join('')}
${cta ? `<p style="margin:24px 0 8px"><a href="${esc(cta.href)}" style="display:inline-block;background:${brand.primary};color:${brand.primaryInk};text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">${esc(cta.label)}</a></p>` : ''}
<p style="margin:24px 0 0;font-size:15px">${esc(brand.signature)}</p></td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid ${brand.line};font-size:12px;color:#666">${esc(brand.siteName)}${brand.address ? ` · ${esc(brand.address.replace(/\n/g, ', '))}` : ''}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [...paragraphs, cta ? `${cta.label}: ${cta.href}` : '', brand.signature].filter(Boolean).join('\n\n');
  return { subject, html, text };
}
