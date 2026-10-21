'use client';

/** Browser side of an upload: sign, send straight to storage, then register so the server checks the bytes. */
export interface MediaItem {
  id: string;
  url: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  caption: string | null;
  folder: string | null;
  focal: { x: number; y: number } | null;
  key: string;
  createdAt: string;
}

async function imageSize(file: File): Promise<{ width?: number; height?: number }> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return {};
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return {};
  }
}

async function json<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { ok?: boolean; message?: string };
  if (!response.ok || body.ok === false) throw new Error(body.message ?? `The server answered ${response.status}.`);
  return body;
}

export async function uploadFile(file: File, opts: { folder?: string; replaceId?: string } = {}): Promise<MediaItem> {
  const mime = file.type || (file.name.endsWith('.md') ? 'text/markdown' : file.name.endsWith('.csv') ? 'text/csv' : 'application/octet-stream');
  const { upload } = await json<{ upload: { url: string; method: 'POST' | 'PUT'; fields?: Record<string, string>; headers?: Record<string, string>; key: string } }>(
    await fetch('/api/admin/media/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, mime, size: file.size, folder: opts.folder, replaceId: opts.replaceId }),
    }),
  );

  let sent: Response;
  if (upload.method === 'POST') {
    const form = new FormData();
    for (const [k, v] of Object.entries(upload.fields ?? {})) form.append(k, v);
    form.append('file', file);
    sent = await fetch(upload.url, { method: 'POST', body: form });
  } else {
    sent = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body: file });
  }
  if (!sent.ok) throw new Error(`The storage provider refused the file (${sent.status}). Check its CORS settings.`);

  const { media } = await json<{ media: MediaItem }>(
    await fetch('/api/admin/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: upload.key, mime, size: file.size, folder: opts.folder, replaceId: opts.replaceId, ...(await imageSize(file)) }),
    }),
  );
  return media;
}

export async function patchMedia(id: string, data: Partial<Pick<MediaItem, 'alt' | 'caption' | 'folder' | 'focal'>>): Promise<MediaItem> {
  const { media } = await json<{ media: MediaItem }>(
    await fetch(`/api/admin/media/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  );
  return media;
}

export interface Usage {
  label: string;
  title: string;
  href: string;
}

export async function getUsage(id: string): Promise<Usage[]> {
  const { usage } = await json<{ usage: Usage[] }>(await fetch(`/api/admin/media/${id}/usage`));
  return usage;
}

export async function removeMedia(id: string, force: boolean): Promise<{ deleted: boolean; usage: Usage[] }> {
  return json(await fetch(`/api/admin/media/${id}${force ? '?force=1' : ''}`, { method: 'DELETE' }));
}

export { json as readJson };
