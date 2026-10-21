'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Notice, inputClass } from '../ui';
import { getUsage, patchMedia, readJson, removeMedia, uploadFile, type MediaItem, type Usage } from './upload';

interface Props {
  /** In pick mode a "Use this file" button appears and alt text is required for images. */
  mode?: 'manage' | 'pick';
  accept?: 'image' | 'any';
  onPick?: (item: MediaItem) => void;
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const isImage = (m: MediaItem) => m.mime.startsWith('image/');

export function MediaLibrary({ mode = 'manage', accept = 'any', onPick }: Props) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [ready, setReady] = useState(true);
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState('');
  const [missingAlt, setMissingAlt] = useState(false);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (more = false) => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (folder) params.set('folder', folder);
      if (accept === 'image') params.set('kind', 'image');
      if (missingAlt) params.set('missingAlt', 'true');
      if (more && cursor) params.set('cursor', cursor);
      try {
        const data = await readJson<{ items: MediaItem[]; nextCursor: string | null; folders: string[]; uploadsReady: boolean }>(await fetch(`/api/admin/media?${params}`));
        setItems((prev) => (more ? [...prev, ...data.items] : data.items));
        setCursor(data.nextCursor);
        setFolders(data.folders);
        setReady(data.uploadsReady);
      } catch (error) {
        setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not load files.' });
      }
    },
    [q, folder, accept, missingAlt, cursor],
  );

  useEffect(() => {
    const t = setTimeout(() => void load(false), 200);
    return () => clearTimeout(t);
    // Reload only when the filters change, not when the cursor moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, folder, missingAlt, accept]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setNotice(null);
    const done: MediaItem[] = [];
    for (const [i, file] of [...files].entries()) {
      setBusy(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
      try {
        done.push(await uploadFile(file, { folder: folder || undefined }));
      } catch (error) {
        setNotice({ tone: 'error', text: `${file.name}: ${error instanceof Error ? error.message : 'upload failed.'}` });
      }
    }
    setBusy(null);
    if (done.length) {
      setItems((prev) => [...done.reverse(), ...prev]);
      setSelected(done[0] ?? null);
      setNotice({ tone: 'success', text: `${done.length} file${done.length > 1 ? 's' : ''} uploaded. Add alt text to images before using them.` });
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  const replaceItem = (m: MediaItem) => {
    setItems((prev) => prev.map((p) => (p.id === m.id ? m : p)));
    setSelected(m);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-48 flex-1">
            <span className="block text-xs font-medium text-muted">Search</span>
            <input className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Alt text, caption or file name" />
          </label>
          <label>
            <span className="block text-xs font-medium text-muted">Folder</span>
            <select className={inputClass} value={folder} onChange={(e) => setFolder(e.target.value)}>
              <option value="">All folders</option>
              {folders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={missingAlt} onChange={(e) => setMissingAlt(e.target.checked)} />
            Missing alt text
          </label>
          <input ref={fileInput} type="file" multiple={mode === 'manage'} accept={accept === 'image' ? 'image/*' : undefined} className="sr-only" id="media-upload" onChange={(e) => void onFiles(e.target.files)} />
          <Button variant="primary" onClick={() => fileInput.current?.click()} disabled={!ready || Boolean(busy)}>
            Upload files
          </Button>
        </div>
        {!ready ? (
          <div className="mt-4">
            <Notice tone="warning">Uploads are not set up yet. Add a storage provider (Cloudinary or R2) in the environment, then reload.</Notice>
          </div>
        ) : null}
        {busy ? (
          <div className="mt-4">
            <Notice>{busy}</Notice>
          </div>
        ) : null}
        {notice ? (
          <div className="mt-4">
            <Notice tone={notice.tone}>{notice.text}</Notice>
          </div>
        ) : null}
        <div
          className="mt-4 rounded-card border border-dashed border-line p-3"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (ready) void onFiles(e.dataTransfer.files);
          }}
        >
          {items.length === 0 ? (
            <p className="px-2 py-10 text-center text-sm text-muted">No files yet. Upload one, or drop files here.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              {items.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(m)}
                    aria-pressed={selected?.id === m.id}
                    className={`block w-full overflow-hidden rounded-input border text-left ${selected?.id === m.id ? 'border-primary ring-2 ring-primary' : 'border-line'}`}
                  >
                    <span className="flex aspect-square items-center justify-center bg-raised">
                      {isImage(m) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.url} alt={m.alt ?? ''} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-medium text-muted">{m.mime.split('/')[1]?.toUpperCase()}</span>
                      )}
                    </span>
                    <span className="block truncate px-2 py-1 text-xs">
                      {m.alt || <span className="text-warning">No alt text</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {cursor ? (
            <div className="mt-3 text-center">
              <Button onClick={() => void load(true)}>Load more</Button>
            </div>
          ) : null}
        </div>
      </div>
      <aside aria-label="File details" className="min-w-0">
        {selected ? (
          <Details key={selected.id} item={selected} mode={mode} onChange={replaceItem} onPick={onPick} onDeleted={(id) => {
            setItems((prev) => prev.filter((p) => p.id !== id));
            setSelected(null);
            setNotice({ tone: 'success', text: 'File deleted.' });
          }} />
        ) : (
          <p className="rounded-card border border-line bg-surface p-4 text-sm text-muted">Pick a file to see its details.</p>
        )}
      </aside>
    </div>
  );
}

function Details({ item, mode, onChange, onPick, onDeleted }: { item: MediaItem; mode: 'manage' | 'pick'; onChange: (m: MediaItem) => void; onPick?: (m: MediaItem) => void; onDeleted: (id: string) => void }) {
  const [alt, setAlt] = useState(item.alt ?? '');
  const [caption, setCaption] = useState(item.caption ?? '');
  const [folder, setFolder] = useState(item.folder ?? '');
  const [usage, setUsage] = useState<Usage[] | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Usage[] | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const dirty = alt !== (item.alt ?? '') || caption !== (item.caption ?? '') || folder !== (item.folder ?? '');
  const needsAlt = item.mime.startsWith('image/') && !alt.trim();

  useEffect(() => {
    getUsage(item.id).then(setUsage).catch(() => setUsage([]));
  }, [item.id]);

  async function save(): Promise<MediaItem | null> {
    try {
      const m = await patchMedia(item.id, { alt: alt || null, caption: caption || null, folder: folder || null });
      onChange(m);
      setMessage({ tone: 'success', text: 'Saved.' });
      return m;
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Not saved.' });
      return null;
    }
  }

  async function setFocal(e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const focal = { x: Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000, y: Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000 };
    try {
      onChange(await patchMedia(item.id, { focal }));
      setMessage({ tone: 'success', text: 'Focal point saved. Crops keep this spot in view.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Not saved.' });
    }
  }

  async function onReplace(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setMessage({ tone: 'warning', text: 'Replacing…' });
    try {
      onChange(await uploadFile(file, { replaceId: item.id }));
      setMessage({ tone: 'success', text: 'File replaced. Every page that uses it shows the new file.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Replace failed.' });
    }
  }

  async function onDelete(force: boolean) {
    try {
      const result = await removeMedia(item.id, force);
      if (result.deleted) onDeleted(item.id);
      else setConfirmDelete(result.usage);
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Delete failed.' });
    }
  }

  return (
    <div className="space-y-4 rounded-card border border-line bg-surface p-4">
      {item.mime.startsWith('image/') ? (
        <div>
          <button type="button" onClick={(e) => void setFocal(e)} className="relative block w-full overflow-hidden rounded-input bg-raised" aria-label="Click the image to set the focal point">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt={alt} className="w-full" />
            {item.focal ? (
              <span aria-hidden="true" className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-primary" style={{ left: `${item.focal.x * 100}%`, top: `${item.focal.y * 100}%` }} />
            ) : null}
          </button>
          <p className="mt-1 text-xs text-muted">Click the image to set the focal point for crops.</p>
        </div>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">Type</dt>
        <dd>{item.mime}</dd>
        <dt className="text-muted">Size</dt>
        <dd>
          {kb(item.size)}
          {item.width && item.height ? ` · ${item.width} × ${item.height}` : ''}
        </dd>
      </dl>
      <label className="block">
        <span className="text-sm font-medium text-ink">Alt text{item.mime.startsWith('image/') ? <span className="text-danger"> *</span> : null}</span>
        <textarea className={`${inputClass} mt-1 py-2`} rows={2} value={alt} maxLength={300} onChange={(e) => setAlt(e.target.value)} />
        <span className="mt-1 block text-xs text-muted">Describe what the image shows for people who cannot see it. Required before the image can be used.</span>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink">Caption</span>
        <input className={`${inputClass} mt-1`} value={caption} maxLength={500} onChange={(e) => setCaption(e.target.value)} />
        <span className="mt-1 block text-xs text-muted">Optional text shown under the image where the layout supports it.</span>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink">Folder</span>
        <input className={`${inputClass} mt-1`} value={folder} maxLength={60} onChange={(e) => setFolder(e.target.value)} />
        <span className="mt-1 block text-xs text-muted">Group files for easier finding, for example “portfolio”.</span>
      </label>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant={mode === 'pick' ? 'secondary' : 'primary'} onClick={() => void save()} disabled={!dirty}>
          Save details
        </Button>
        {mode === 'pick' && onPick ? (
          <Button
            variant="primary"
            disabled={needsAlt}
            title={needsAlt ? 'Add alt text first' : undefined}
            onClick={async () => {
              const m = dirty ? await save() : item;
              if (m) onPick(m);
            }}
          >
            Use this file
          </Button>
        ) : null}
        <Button onClick={() => void navigator.clipboard?.writeText(new URL(item.url, location.href).toString())}>Copy address</Button>
      </div>
      <div className="border-t border-line pt-3">
        <p className="text-sm font-medium text-ink">Used on</p>
        {usage === null ? (
          <p className="text-xs text-muted">Checking…</p>
        ) : usage.length === 0 ? (
          <p className="text-xs text-muted">Not used anywhere yet.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {usage.map((u) => (
              <li key={u.href}>
                <a className="text-primary underline" href={u.href}>
                  {u.label}: {u.title}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      {mode === 'manage' ? (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <input ref={replaceInput} type="file" className="sr-only" aria-label="Replacement file" onChange={(e) => void onReplace(e.target.files)} />
          <Button onClick={() => replaceInput.current?.click()}>Replace file</Button>
          <Button variant="danger" onClick={() => void onDelete(false)}>
            Delete
          </Button>
        </div>
      ) : null}
      {confirmDelete ? (
        <div className="rounded-input border border-danger p-3 text-sm" role="alert">
          <p className="text-ink">This file is used in {confirmDelete.length} place{confirmDelete.length > 1 ? 's' : ''}. Deleting it leaves broken images there.</p>
          <div className="mt-2 flex gap-2">
            <Button variant="danger" onClick={() => void onDelete(true)}>
              Delete anyway
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Keep it
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
