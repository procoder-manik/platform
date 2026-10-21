'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { BLOCKS, BLOCK_GROUPS, getBlockDef } from '@/lib/blocks/catalog';
import { STYLE_FIELDS } from '@/lib/blocks/style-fields';
import { newBlockId, type Block, type BlockDef } from '@/lib/blocks/types';
import { saveAsGlobalSection, savePreviewDraft } from '@/lib/blocks/actions';
import { FieldControl } from '../fields/FieldControl';
import { Button, Notice, inputClass } from '../ui';

interface Props {
  value: Block[];
  onChange: (blocks: Block[]) => void;
  isAdmin: boolean;
  timeZone: string;
  /** Module ids that are live, to filter the palette. */
  liveModules: string[];
  errors?: Record<string, string>;
  fieldName: string;
}

type Path = { index: number; child?: number };
const WIDTHS = { desktop: '100%', tablet: '820px', phone: '390px' } as const;

function cloneBlock(b: Block): Block {
  return { ...structuredClone(b), id: newBlockId(), children: b.children?.map(cloneBlock) };
}

function makeBlock(def: BlockDef): Block {
  return { id: newBlockId(), type: def.type, props: structuredClone(def.defaults), style: { ...(def.defaultStyle ?? {}) }, hidden: false, children: def.container ? [] : undefined };
}

/** The page builder: block list with drag, hide, duplicate and delete; a palette; per-block fields and design; a live preview. */
export function BlockBuilder({ value, onChange, isAdmin, timeZone, liveModules, errors = {}, fieldName }: Props) {
  const [selected, setSelected] = useState<Path | null>(value.length ? { index: 0 } : null);
  const [paletteFor, setPaletteFor] = useState<{ container?: number } | null>(null);
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<'content' | 'layout' | 'style'>('content');
  const [width, setWidth] = useState<keyof typeof WIDTHS>('desktop');
  const [previewKey, setPreviewKey] = useState(0);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<{ past: Block[][]; future: Block[][] }>({ past: [], future: [] });
  const dragFrom = useRef<number | null>(null);

  const commit = (next: Block[]) => {
    setHistory((h) => ({ past: [...h.past.slice(-49), value], future: [] }));
    onChange(next);
  };
  const undo = () => {
    const prev = history.past.at(-1);
    if (!prev) return;
    setHistory((h) => ({ past: h.past.slice(0, -1), future: [value, ...h.future] }));
    onChange(prev);
  };
  const redo = () => {
    const next = history.future[0];
    if (!next) return;
    setHistory((h) => ({ past: [...h.past, value], future: h.future.slice(1) }));
    onChange(next);
  };

  // Live preview: send the unsaved blocks a moment after the last change, then reload the frame.
  useEffect(() => {
    const t = setTimeout(async () => {
      const result = await savePreviewDraft(value);
      if (result.ok) {
        setPreviewError(null);
        setPreviewKey((k) => k + 1);
      } else setPreviewError(result.message);
    }, 700);
    return () => clearTimeout(t);
  }, [value]);

  const get = (p: Path | null): Block | undefined => (p ? (p.child === undefined ? value[p.index] : value[p.index]?.children?.[p.child]) : undefined);
  const current = get(selected);
  const currentDef = current ? getBlockDef(current.type) : undefined;

  const update = (p: Path, fn: (b: Block) => Block) =>
    commit(
      value.map((b, i) => {
        if (i !== p.index) return b;
        if (p.child === undefined) return fn(b);
        return { ...b, children: (b.children ?? []).map((c, j) => (j === p.child ? fn(c) : c)) };
      }),
    );

  const listAt = (container?: number) => (container === undefined ? value : (value[container]?.children ?? []));
  const setList = (container: number | undefined, list: Block[]) =>
    commit(container === undefined ? list : value.map((b, i) => (i === container ? { ...b, children: list } : b)));

  const move = (p: Path, by: number) => {
    const list = [...listAt(p.child === undefined ? undefined : p.index)];
    const from = p.child ?? p.index;
    const to = from + by;
    if (to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to] as Block, list[from] as Block];
    setList(p.child === undefined ? undefined : p.index, list);
    setSelected(p.child === undefined ? { index: to } : { index: p.index, child: to });
  };

  const remove = (p: Path) => {
    const block = get(p);
    if (!block || !window.confirm(`Delete the ${getBlockDef(block.type)?.label ?? 'section'} section? Undo brings it back.`)) return;
    const container = p.child === undefined ? undefined : p.index;
    setList(container, listAt(container).filter((_, i) => i !== (p.child ?? p.index)));
    setSelected(null);
  };

  const duplicate = (p: Path) => {
    const block = get(p);
    if (!block) return;
    const container = p.child === undefined ? undefined : p.index;
    const list = [...listAt(container)];
    const at = (p.child ?? p.index) + 1;
    list.splice(at, 0, cloneBlock(block));
    setList(container, list);
    setSelected(container === undefined ? { index: at } : { index: container, child: at });
  };

  const add = (def: BlockDef) => {
    const block = makeBlock(def);
    const container = paletteFor?.container;
    if (container !== undefined) {
      const list = [...listAt(container), block];
      setList(container, list);
      setSelected({ index: container, child: list.length - 1 });
    } else {
      const at = selected && selected.child === undefined ? selected.index + 1 : value.length;
      const list = [...value];
      list.splice(at, 0, block);
      commit(list);
      setSelected({ index: at });
    }
    setPaletteFor(null);
    setQuery('');
    setPanel('content');
  };

  async function saveGlobal(p: Path) {
    const block = get(p);
    if (!block) return;
    const name = window.prompt('Name this saved section (only staff see it):', getBlockDef(block.type)?.label ?? 'Saved section');
    if (!name) return;
    const result = await saveAsGlobalSection(name, block);
    setNotice(result.message);
    if (result.ok && result.id) {
      const def = getBlockDef('globalSection');
      if (def) update(p, () => ({ ...makeBlock(def), props: { sectionId: result.id } }));
    }
  }

  const palette = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BLOCKS.filter((b) => liveModules.includes(b.module) && (isAdmin || !b.adminOnly))
      .filter((b) => (paletteFor?.container === undefined ? true : !b.container))
      .filter((b) => !q || `${b.label} ${b.description} ${b.group}`.toLowerCase().includes(q));
  }, [query, liveModules, isAdmin, paletteFor]);

  const errorFor = (path: string) => Object.entries(errors).filter(([k]) => k === path || k.startsWith(`${path}.`)).map(([, v]) => v);
  const pathKey = (p: Path) => (p.child === undefined ? `${fieldName}.${p.index}` : `${fieldName}.${p.index}.children.${p.child}`);
  const contentFields = currentDef?.fields.filter((f) => f.tab !== 'Layout') ?? [];
  const layoutFields = currentDef?.fields.filter((f) => f.tab === 'Layout') ?? [];

  const row = (block: Block, p: Path, list: Block[]) => {
    const def = getBlockDef(block.type);
    const isSel = selected?.index === p.index && selected.child === p.child;
    const hasErrors = errorFor(pathKey(p)).length > 0;
    const title = String(block.props.heading ?? block.props.name ?? block.props.label ?? '') || def?.label;
    return (
      <div
        draggable={p.child === undefined}
        onDragStart={() => (dragFrom.current = p.index)}
        onDragOver={(e) => p.child === undefined && e.preventDefault()}
        onDrop={() => {
          if (p.child !== undefined || dragFrom.current === null || dragFrom.current === p.index) return;
          const next = [...value];
          const [moved] = next.splice(dragFrom.current, 1);
          next.splice(p.index, 0, moved as Block);
          commit(next);
          setSelected({ index: p.index });
          dragFrom.current = null;
        }}
        className={`flex items-center gap-1 rounded-input border px-2 py-1.5 ${isSel ? 'border-primary bg-raised' : 'border-line bg-surface'} ${block.hidden ? 'opacity-60' : ''}`}
      >
        {p.child === undefined ? <span className="cursor-grab select-none px-1 text-muted" aria-hidden="true" title="Drag to reorder">⋮⋮</span> : null}
        <button type="button" onClick={() => { setSelected(p); setPanel('content'); }} className="min-h-9 min-w-0 flex-1 truncate text-left text-sm" aria-current={isSel}>
          <span className="font-medium text-ink">{def?.label ?? block.type}</span>
          {title && title !== def?.label ? <span className="text-muted">: {title}</span> : null}
          {hasErrors ? <span className="ml-1 text-danger">needs attention</span> : null}
        </button>
        <button type="button" className="min-h-9 min-w-9 text-xs text-muted hover:text-ink" onClick={() => move(p, -1)} disabled={(p.child ?? p.index) === 0} aria-label="Move up">↑</button>
        <button type="button" className="min-h-9 min-w-9 text-xs text-muted hover:text-ink" onClick={() => move(p, 1)} disabled={(p.child ?? p.index) === list.length - 1} aria-label="Move down">↓</button>
        <button type="button" className="min-h-9 px-1 text-xs text-muted hover:text-ink" onClick={() => update(p, (b) => ({ ...b, hidden: !b.hidden }))} aria-pressed={block.hidden === true}>{block.hidden ? 'Show' : 'Hide'}</button>
        <button type="button" className="min-h-9 px-1 text-xs text-muted hover:text-ink" onClick={() => duplicate(p)}>Copy</button>
        <button type="button" className="min-h-9 px-1 text-xs text-muted hover:text-danger" onClick={() => remove(p)}>Delete</button>
      </div>
    );
  };

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,28rem)_1fr]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setPaletteFor({})}>Add section</Button>
          <Button onClick={undo} disabled={!history.past.length}>Undo</Button>
          <Button onClick={redo} disabled={!history.future.length}>Redo</Button>
        </div>
        {notice ? <Notice>{notice}</Notice> : null}

        {paletteFor ? (
          <div className="rounded-card border border-line bg-surface p-3" role="dialog" aria-label="Add a section">
            <div className="flex gap-2">
              <input autoFocus className={inputClass} placeholder="Search sections" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search sections" />
              <Button variant="ghost" onClick={() => setPaletteFor(null)}>Close</Button>
            </div>
            <div className="mt-3 max-h-96 space-y-4 overflow-auto">
              {BLOCK_GROUPS.map((group) => {
                const items = palette.filter((b) => b.group === group);
                if (!items.length) return null;
                return (
                  <div key={group}>
                    <p className="text-xs font-medium text-muted">{group}</p>
                    <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                      {items.map((b) => (
                        <li key={b.type}>
                          <button type="button" onClick={() => add(b)} className="block min-h-14 w-full rounded-input border border-line px-3 py-2 text-left hover:border-primary">
                            <span className="block text-sm font-medium text-ink">{b.label}</span>
                            <span className="block text-xs text-muted">{b.description}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {value.length === 0 ? (
          <p className="rounded-card border border-dashed border-line p-6 text-center text-sm text-muted">No sections yet. Add one to start building the page.</p>
        ) : (
          <ol className="space-y-1.5">
            {value.map((block, index) => (
              <li key={block.id}>
                {row(block, { index }, value)}
                {getBlockDef(block.type)?.container ? (
                  <div className="ml-6 mt-1.5 space-y-1.5 border-l-2 border-line pl-3">
                    {(block.children ?? []).map((child, ci) => <div key={child.id}>{row(child, { index, child: ci }, block.children ?? [])}</div>)}
                    <button type="button" className="min-h-9 text-sm text-primary underline" onClick={() => setPaletteFor({ container: index })}>Add inside</button>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}

        {current && currentDef && selected ? (
          <div className="rounded-card border border-line bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-ink">{currentDef.label}</h3>
              {isAdmin && current.type !== 'globalSection' ? <Button variant="ghost" onClick={() => void saveGlobal(selected)}>Save as global section</Button> : null}
            </div>
            {errorFor(pathKey(selected)).length ? <div className="mt-3"><Notice tone="error">{errorFor(pathKey(selected)).join(' ')}</Notice></div> : null}
            <div role="tablist" aria-label="Section settings" className="mt-3 flex gap-1 border-b border-line">
              {(['content', ...(layoutFields.length ? ['layout'] : []), 'style'] as const).map((tab) => (
                <button key={tab} type="button" role="tab" aria-selected={panel === tab} onClick={() => setPanel(tab as typeof panel)} className={`-mb-px min-h-10 border-b-2 px-3 text-sm ${panel === tab ? 'border-primary text-ink' : 'border-transparent text-muted'}`}>
                  {tab === 'content' ? 'Content' : tab === 'layout' ? 'Layout' : 'Design'}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {(panel === 'style' ? STYLE_FIELDS : panel === 'layout' ? layoutFields : contentFields).map((f) => (
                <FieldControl
                  key={`${current.id}-${f.name}`}
                  field={f}
                  value={panel === 'style' ? (current.style as Record<string, unknown>)[f.name] : current.props[f.name]}
                  onChange={(v) => update(selected, (b) => (panel === 'style' ? { ...b, style: { ...b.style, [f.name]: v } } : { ...b, props: { ...b.props, [f.name]: v } }))}
                  error={errors[`${pathKey(selected)}.${f.name}`]?.replace(/^[^:]+: /, '')}
                  record={panel === 'style' ? (current.style as Record<string, unknown>) : current.props}
                  timeZone={timeZone}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="min-w-0 2xl:sticky 2xl:top-4 2xl:self-start">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-ink">Preview</p>
          <div role="radiogroup" aria-label="Preview width" className="inline-flex rounded-button border border-line p-0.5">
            {(Object.keys(WIDTHS) as (keyof typeof WIDTHS)[]).map((w) => (
              <button key={w} type="button" role="radio" aria-checked={width === w} onClick={() => setWidth(w)} className={`min-h-8 rounded-button px-3 text-xs ${width === w ? 'bg-primary text-primary-ink' : 'text-body'}`}>
                {w.charAt(0).toUpperCase() + w.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {previewError ? <div className="mb-2"><Notice tone="warning">Preview paused: {previewError}</Notice></div> : null}
        <div className="overflow-auto rounded-card border border-line bg-raised p-2">
          <iframe
            key={previewKey}
            src={`/preview/draft?v=${previewKey}`}
            title="Page preview"
            className="mx-auto block h-[70vh] rounded-input border border-line bg-base"
            style={{ width: WIDTHS[width], maxWidth: '100%' }}
          />
        </div>
        <p className="mt-2 text-xs text-muted">The preview shows unsaved changes. Save to publish them.</p>
      </div>
    </div>
  );
}
