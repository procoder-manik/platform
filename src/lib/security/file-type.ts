/**
 * Upload checks by real file bytes, not by the name or the browser's claim.
 * Executables and unknown types are refused. SVG files are refused when they contain scripts or active content.
 */
export type FileKind = 'image' | 'svg' | 'video' | 'pdf' | 'font' | 'text';

export interface Sniffed {
  mime: string;
  kind: FileKind;
}

/** Largest size per kind, in bytes. */
export const SIZE_LIMITS: Record<FileKind, number> = {
  image: 10 * 1024 * 1024,
  svg: 2 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  pdf: 20 * 1024 * 1024,
  font: 5 * 1024 * 1024,
  text: 5 * 1024 * 1024,
};

export const ACCEPTED_MIME: Record<string, FileKind> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/avif': 'image',
  'image/svg+xml': 'svg',
  'video/mp4': 'video',
  'video/webm': 'video',
  'application/pdf': 'pdf',
  'font/woff2': 'font',
  'font/woff': 'font',
  'font/ttf': 'font',
  'font/otf': 'font',
  'text/csv': 'text',
  'text/plain': 'text',
  'text/markdown': 'text',
  'application/json': 'text',
};

const starts = (b: Uint8Array, bytes: number[], offset = 0) => bytes.every((v, i) => b[offset + i] === v);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

/** Detects the type from the first bytes (4 KB is plenty). Returns null for anything not accepted. */
export function sniff(bytes: Uint8Array, declaredMime = ''): Sniffed | null {
  if (bytes.length < 4) return null;
  if (starts(bytes, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', kind: 'image' };
  if (starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', kind: 'image' };
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return { mime: 'image/gif', kind: 'image' };
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return { mime: 'image/webp', kind: 'image' };
  if (ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (brand === 'avif' || brand === 'avis') return { mime: 'image/avif', kind: 'image' };
    if (['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash'].includes(brand)) return { mime: 'video/mp4', kind: 'video' };
    return null;
  }
  if (starts(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return { mime: 'video/webm', kind: 'video' };
  if (ascii(bytes, 0, 5) === '%PDF-') return { mime: 'application/pdf', kind: 'pdf' };
  if (ascii(bytes, 0, 4) === 'wOF2') return { mime: 'font/woff2', kind: 'font' };
  if (ascii(bytes, 0, 4) === 'wOFF') return { mime: 'font/woff', kind: 'font' };
  if (starts(bytes, [0x00, 0x01, 0x00, 0x00])) return { mime: 'font/ttf', kind: 'font' };
  if (ascii(bytes, 0, 4) === 'OTTO') return { mime: 'font/otf', kind: 'font' };
  // Refuse known binary and executable signatures outright.
  if (ascii(bytes, 0, 2) === 'MZ' || starts(bytes, [0x7f, 0x45, 0x4c, 0x46]) || ascii(bytes, 0, 2) === 'PK' || ascii(bytes, 0, 2) === '#!') return null;
  // Text: valid UTF-8 without NUL bytes.
  if (bytes.includes(0)) return null;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.length === 4096 ? trimPartialUtf8(bytes) : bytes);
  } catch {
    return null;
  }
  const head = text.replace(/^\uFEFF/, '').trimStart().slice(0, 1000).toLowerCase();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return { mime: 'image/svg+xml', kind: 'svg' };
  if (head.startsWith('<')) return null; // HTML and other markup are not accepted as uploads.
  const textMimes = ['text/csv', 'text/plain', 'text/markdown', 'application/json'];
  return { mime: textMimes.includes(declaredMime) ? declaredMime : 'text/plain', kind: 'text' };
}

function trimPartialUtf8(bytes: Uint8Array): Uint8Array {
  const end = bytes.length;
  for (let i = 1; i <= 3 && end - i >= 0; i += 1) {
    const b = bytes[end - i] as number;
    if ((b & 0xc0) === 0xc0) return bytes.slice(0, end - i);
    if ((b & 0x80) === 0) break;
  }
  return bytes.slice(0, end);
}

/** Returns a reason when an SVG has active content, or null when it is safe to serve. */
export function svgProblem(svg: string): string | null {
  const s = svg.toLowerCase();
  if (/<script[\s>]/.test(s)) return 'This SVG contains a script.';
  if (/\son[a-z]+\s*=/.test(s)) return 'This SVG contains event handlers (onload, onclick...).';
  if (/javascript:|vbscript:|data:text\/html/.test(s)) return 'This SVG contains a script link.';
  if (/<(foreignobject|iframe|embed|object|use[^>]+href\s*=\s*["']https?:)/.test(s)) return 'This SVG embeds outside or active content.';
  if (/<!entity/.test(s)) return 'This SVG uses XML entities, which are not allowed.';
  return null;
}
