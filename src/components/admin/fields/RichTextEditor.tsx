'use client';

import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import { TableKit } from '@tiptap/extension-table';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { useEffect, useRef, useState } from 'react';
import { ArticleButton, Callout } from '@/lib/richtext/extensions';
import { docToMarkdown, markdownToDoc } from '@/lib/richtext/markdown';
import type { RtNode } from '@/lib/richtext/render';
import { MediaDialog } from '../media/MediaPicker';
import { Button, inputClass } from '../ui';

interface Props {
  id: string;
  value: unknown;
  onChange: (doc: unknown) => void;
  describedBy: string;
  disabled?: boolean;
}

const toDoc = (v: unknown): RtNode => (v && typeof v === 'object' ? (v as RtNode) : typeof v === 'string' && v.trim() ? markdownToDoc(v) : { type: 'doc', content: [{ type: 'paragraph' }] });

function Tool({ label, onClick, active, disabled }: { label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} disabled={disabled} aria-pressed={active} className={`min-h-9 rounded-button px-2 text-sm ${active ? 'bg-primary text-primary-ink' : 'text-ink hover:bg-raised'} disabled:opacity-40`}>
      {label}
    </button>
  );
}

/** Link picker: an address, or a search across pages and posts. */
function LinkBox({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [href, setHref] = useState(String(editor.getAttributes('link').href ?? ''));
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ label: string; href: string }[]>([]);
  useEffect(() => {
    if (q.length < 2) return;
    const c = new AbortController();
    const t = setTimeout(async () => {
      const results: { label: string; href: string }[] = [];
      for (const [resource, prefix] of [['pages', '/'], ['posts', '/blog/']] as const) {
        try {
          const r = await fetch(`/api/admin/${resource}/options?q=${encodeURIComponent(q)}&slug=1`, { signal: c.signal });
          const d = (await r.json()) as { options?: { label: string; slug?: string }[] };
          for (const o of d.options ?? []) if (o.slug) results.push({ label: o.label, href: `${prefix}${o.slug}` });
        } catch {
          /* module may be off */
        }
      }
      setHits(results.slice(0, 8));
    }, 250);
    return () => {
      clearTimeout(t);
      c.abort();
    };
  }, [q]);
  const apply = (value: string) => {
    if (!value) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run();
    onDone();
  };
  return (
    <div className="space-y-2 border-b border-line bg-surface p-3">
      <label className="block text-xs font-medium text-muted">
        Address
        <input className={`${inputClass} mt-1`} value={href} onChange={(e) => setHref(e.target.value)} placeholder="https://… or /page" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), apply(href))} />
      </label>
      <label className="block text-xs font-medium text-muted">
        Or find a page or post
        <input className={`${inputClass} mt-1`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search" />
      </label>
      {hits.length ? (
        <ul className="max-h-40 overflow-auto rounded-input border border-line">
          {hits.map((h) => (
            <li key={h.href}><button type="button" className="block min-h-9 w-full px-3 text-left text-sm hover:bg-raised" onClick={() => apply(h.href)}>{h.label} <span className="text-muted">{h.href}</span></button></li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => apply(href)}>Apply</Button>
        <Button onClick={() => apply('')}>Remove link</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

/** Tiptap editor: H2 to H4, lists, quotes, code, tables, images from the media library, YouTube, callouts, buttons, links and Markdown import and export. */
export function RichTextEditor({ id, value, onChange, describedBy, disabled }: Props) {
  const [mediaOpen, setMediaOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [mdOpen, setMdOpen] = useState<null | 'import' | 'export'>(null);
  const [md, setMd] = useState('');
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  }, [onChange]);

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: { openOnClick: false, autolink: true, protocols: ['mailto', 'tel'] } }),
      Image.configure({ inline: false }),
      Youtube.configure({ nocookie: true, controls: true }),
      TableKit.configure({ table: { resizable: false } }),
      CharacterCount,
      Placeholder.configure({ placeholder: 'Start writing. Use H2 for main sections and H3 inside them.' }),
      Callout,
      ArticleButton,
    ],
    content: toDoc(value),
    editorProps: { attributes: { id, 'aria-describedby': describedBy, 'aria-multiline': 'true', role: 'textbox', class: 'prose-site min-h-64 max-w-none px-4 py-3 focus:outline-none' } },
    onUpdate: ({ editor: e }) => latest.current(e.getJSON()),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            h: [2, 3, 4].find((l) => e.isActive('heading', { level: l })) ?? 0,
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            strike: e.isActive('strike'),
            code: e.isActive('code'),
            link: e.isActive('link'),
            bullet: e.isActive('bulletList'),
            ordered: e.isActive('orderedList'),
            quote: e.isActive('blockquote'),
            codeBlock: e.isActive('codeBlock'),
            table: e.isActive('table'),
            words: e.storage.characterCount.words() as number,
            chars: e.storage.characterCount.characters() as number,
          }
        : null,
  });

  if (!editor || !state) return <div className="min-h-64 rounded-input border border-line bg-base" aria-busy="true" />;
  const chain = () => editor.chain().focus();

  return (
    <div className="overflow-hidden rounded-input border border-line bg-base">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-0.5 border-b border-line bg-surface p-1">
        <select aria-label="Text style" className="min-h-9 rounded-button bg-transparent px-1 text-sm text-ink" value={state.h} onChange={(e) => (Number(e.target.value) ? chain().setHeading({ level: Number(e.target.value) as 2 | 3 | 4 }).run() : chain().setParagraph().run())}>
          <option value={0}>Paragraph</option>
          <option value={2}>Heading 2</option>
          <option value={3}>Heading 3</option>
          <option value={4}>Heading 4</option>
        </select>
        <Tool label="Bold" active={state.bold} onClick={() => chain().toggleBold().run()} />
        <Tool label="Italic" active={state.italic} onClick={() => chain().toggleItalic().run()} />
        <Tool label="Strike" active={state.strike} onClick={() => chain().toggleStrike().run()} />
        <Tool label="Code" active={state.code} onClick={() => chain().toggleCode().run()} />
        <Tool label="Link" active={state.link} onClick={() => setLinkOpen((o) => !o)} />
        <Tool label="• List" active={state.bullet} onClick={() => chain().toggleBulletList().run()} />
        <Tool label="1. List" active={state.ordered} onClick={() => chain().toggleOrderedList().run()} />
        <Tool label="Quote" active={state.quote} onClick={() => chain().toggleBlockquote().run()} />
        <Tool label="Code block" active={state.codeBlock} onClick={() => chain().toggleCodeBlock().run()} />
        <Tool label="Line" onClick={() => chain().setHorizontalRule().run()} />
        <Tool label="Image" onClick={() => setMediaOpen(true)} />
        <Tool label="Video" onClick={() => {
          const src = window.prompt('YouTube address');
          if (src) chain().setYoutubeVideo({ src }).run();
        }} />
        <Tool label={state.table ? 'Delete table' : 'Table'} onClick={() => (state.table ? chain().deleteTable().run() : chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())} />
        {state.table ? (
          <>
            <Tool label="+ Row" onClick={() => chain().addRowAfter().run()} />
            <Tool label="+ Column" onClick={() => chain().addColumnAfter().run()} />
          </>
        ) : null}
        <Tool label="Callout" onClick={() => chain().insertContent({ type: 'callout', attrs: { tone: 'info' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note: ' }] }] }).run()} />
        <Tool label="Button" onClick={() => {
          const label = window.prompt('Button text', 'Get in touch');
          const href = label ? window.prompt('Button link', '/contact') : null;
          if (label && href) chain().insertContent({ type: 'button', attrs: { label, href } }).run();
        }} />
        <Tool label="Undo" onClick={() => chain().undo().run()} />
        <Tool label="Redo" onClick={() => chain().redo().run()} />
        <span className="ml-auto flex gap-0.5">
          <Tool label="Import Markdown" onClick={() => { setMd(''); setMdOpen('import'); }} />
          <Tool label="Export Markdown" onClick={() => { setMd(docToMarkdown(editor.getJSON() as RtNode)); setMdOpen('export'); }} />
        </span>
      </div>
      {linkOpen ? <LinkBox editor={editor} onDone={() => setLinkOpen(false)} /> : null}
      {mdOpen ? (
        <div className="space-y-2 border-b border-line bg-surface p-3">
          <label className="block text-xs font-medium text-muted">
            {mdOpen === 'import' ? 'Paste Markdown. It replaces the current text.' : 'Markdown copy of this text.'}
            <textarea className={`${inputClass} mt-1 py-2 font-mono text-xs`} rows={8} value={md} readOnly={mdOpen === 'export'} onChange={(e) => setMd(e.target.value)} />
          </label>
          <div className="flex gap-2">
            {mdOpen === 'import' ? <Button variant="primary" onClick={() => { editor.commands.setContent(markdownToDoc(md)); latest.current(editor.getJSON()); setMdOpen(null); }}>Replace text</Button> : <Button onClick={() => void navigator.clipboard?.writeText(md)}>Copy</Button>}
            <Button variant="ghost" onClick={() => setMdOpen(null)}>Close</Button>
          </div>
        </div>
      ) : null}
      <EditorContent editor={editor} />
      <p className="border-t border-line px-3 py-1.5 text-xs text-muted" aria-live="polite">
        {state.words} words, {state.chars} characters, about {Math.max(1, Math.round(state.words / 220))} min read
      </p>
      <MediaDialog open={mediaOpen} onClose={() => setMediaOpen(false)} onPick={(src, alt) => { chain().setImage({ src, alt }).run(); setMediaOpen(false); }} />
    </div>
  );
}
