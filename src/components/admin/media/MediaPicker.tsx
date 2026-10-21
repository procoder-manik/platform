'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui';
import { MediaLibrary } from './MediaLibrary';

type Common = { id: string; 'aria-describedby': string; 'aria-invalid': boolean; disabled?: boolean };

interface Props {
  common: Common;
  accept: 'image' | 'any';
  multiple?: boolean;
  value?: string | null;
  values?: string[];
  onChange?: (v: unknown) => void;
  onChangeMany?: (v: unknown) => void;
}

/** Image, file and gallery fields: a preview, and a dialog with the media library in pick mode. */
export function MediaPicker({ common, accept, multiple, value, values = [], onChange, onChangeMany }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const list = multiple ? values : value ? [value] : [];

  return (
    <div>
      {list.length ? (
        <ul className="mb-2 flex flex-wrap gap-2">
          {list.map((url) => (
            <li key={url} className="relative">
              {accept === 'image' || /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url) || url.includes('/image/') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="h-20 w-20 rounded-input border border-line object-cover" />
              ) : (
                <span className="block max-w-56 truncate rounded-input border border-line px-2 py-1 text-xs">{url}</span>
              )}
              <button
                type="button"
                aria-label="Remove file"
                className="absolute -right-2 -top-2 h-6 w-6 rounded-full border border-line bg-surface text-xs"
                onClick={() => (multiple ? onChangeMany?.(values.filter((v) => v !== url)) : onChange?.(null))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button id={common.id} aria-describedby={common['aria-describedby']} onClick={() => setOpen(true)} disabled={common.disabled}>
        {list.length && !multiple ? 'Change file' : multiple ? 'Add images' : accept === 'image' ? 'Choose image' : 'Choose file'}
      </Button>
      <dialog ref={dialog} onClose={() => setOpen(false)} className="m-auto w-[min(72rem,95vw)] rounded-card border border-line bg-base p-0 text-body backdrop:bg-ink/50" aria-label="Media library">
        {open ? (
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink">Media library</h2>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
            <MediaLibrary
              mode="pick"
              accept={accept}
              onPick={(m) => {
                if (multiple) onChangeMany?.([...values.filter((v) => v !== m.url), m.url]);
                else onChange?.(m.url);
                setOpen(false);
              }}
            />
          </div>
        ) : null}
      </dialog>
    </div>
  );
}

/** The media library in a dialog, opened from code (for example by the rich text editor). */
export function MediaDialog({ open, onClose, onPick, accept = 'image' }: { open: boolean; onClose: () => void; onPick: (url: string, alt: string) => void; accept?: 'image' | 'any' }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <dialog ref={dialog} onClose={onClose} className="m-auto w-[min(72rem,95vw)] rounded-card border border-line bg-base p-0 text-body backdrop:bg-ink/50" aria-label="Media library">
      {open ? (
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-ink">Media library</h2>
            <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
          <MediaLibrary mode="pick" accept={accept} onPick={(m) => onPick(m.url, m.alt ?? '')} />
        </div>
      ) : null}
    </dialog>
  );
}
