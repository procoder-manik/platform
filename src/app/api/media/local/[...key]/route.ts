import { readLocal } from '@/lib/adapters/storage/local';
import { sniff } from '@/lib/security/file-type';

export const dynamic = 'force-dynamic';

/** Serves files from the development-only local storage. Never available in production. */
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (process.env.NODE_ENV === 'production') return new Response('Not found', { status: 404 });
  const { key } = await params;
  try {
    const data = await readLocal(key.join('/'));
    const type = sniff(new Uint8Array(data.subarray(0, 4096)))?.mime ?? 'application/octet-stream';
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=60',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
