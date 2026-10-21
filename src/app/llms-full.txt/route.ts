import { buildLlms } from '@/lib/seo/llms';

export const revalidate = 3600;

export async function GET() {
  return new Response(await buildLlms(true), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
