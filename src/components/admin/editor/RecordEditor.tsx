'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { bulkActionAction, duplicateAction, restoreRevisionAction, saveRecordAction } from '@/lib/admin/actions';
import { getPath, setPath, type FieldDef } from '@/lib/admin/fields';
import { tabsOf, type ClientResource } from '@/lib/admin/resource';
import { FieldControl } from '../fields/FieldControl';
import { formatDate } from '../format';
import { Button, Notice, StatusChip } from '../ui';
import { SeoPanel } from './SeoPanel';

export interface RevisionSummary {
  id: string;
  createdAt: string;
  by: string;
}

interface Props {
  resource: ClientResource;
  fields: FieldDef[];
  initial: Record<string, unknown>;
  id: string | null;
  revisions: RevisionSummary[];
  previewUrl: string | null;
  liveUrl: string | null;
  timeZone: string;
  isAdmin: boolean;
  /** Message carried over from the previous screen, for example after creating. */
  flash?: string;
  liveModules: string[];
  /** Present when the resource has an SEO tab. */
  seoInfo?: { siteName: string; siteUrl: string } | null;
}

type SaveState = 'saved' | 'unsaved' | 'saving';

/** The generic editor: tabs, sticky save bar, Ctrl or Cmd + S, leave guard, revisions and record actions. */
export function RecordEditor({ resource, fields, initial, id, revisions, previewUrl, liveUrl, timeZone, isAdmin, flash, liveModules, seoInfo }: Props) {
  const router = useRouter();
  const tabs = useMemo(() => tabsOf({ ...resource, fields }), [resource, fields]);
  const [tab, setTab] = useState(tabs[0] ?? 'Content');
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [saved, setSaved] = useState<Record<string, unknown>>(initial);
  const [state, setState] = useState<SaveState>(id ? 'saved' : 'unsaved');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(flash ? { tone: 'success', text: flash } : null);
  const [showRevisions, setShowRevisions] = useState(false);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const readOnly = resource.readOnly === true;

  const dirty = state === 'unsaved' || JSON.stringify(values) !== JSON.stringify(saved);

  const update = (name: string, value: unknown) => {
    setValues((prev) => setPath(prev, name, value));
    setState('unsaved');
    if (errors[name]) setErrors(({ [name]: _gone, ...rest }) => rest);
  };

  const save = useCallback(() => {
    if (readOnly || state === 'saving') return;
    setState('saving');
    setMessage(null);
    const payload: Record<string, unknown> = {};
    for (const f of fields) payload[f.name] = getPath(values, f.name);
    startTransition(async () => {
      const result = await saveRecordAction(resource.id, id, payload);
      if (!result.ok) {
        setState('unsaved');
        setErrors(result.errors);
        setMessage({ tone: 'error', text: result.message });
        const first = Object.keys(result.errors)[0];
        const field = fields.find((f) => first === f.name || first?.startsWith(`${f.name}.`));
        if (field) setTab(field.tab ?? 'Content');
        requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"] [aria-invalid="true"], [data-field="${first}"] input, [data-field="${first}"] textarea, [data-field="${first}"] select`)?.focus());
        return;
      }
      const record = result.record ?? values;
      setErrors({});
      setValues(record);
      setSaved(record);
      setState('saved');
      setMessage({ tone: 'success', text: result.message });
      if (!id && result.id) router.replace(`/admin/${resource.id}/${encodeURIComponent(result.id)}?created=1`);
      else router.refresh();
    });
  }, [fields, id, readOnly, resource.id, router, state, values]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  useEffect(() => {
    if (!dirty || readOnly) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, readOnly]);

  const leave = (href: string) => {
    if (dirty && !readOnly && !window.confirm('You have unsaved changes. Leave without saving?')) return;
    router.push(href);
  };

  async function duplicate() {
    if (!id) return;
    const result = await duplicateAction(resource.id, id);
    if (result.ok && result.id) router.push(`/admin/${resource.id}/${encodeURIComponent(result.id)}`);
    else setMessage({ tone: 'error', text: result.message });
  }

  async function trash() {
    if (!id) return;
    const verb = resource.softDelete ? 'Move this to Trash?' : 'Delete this for good? This cannot be undone.';
    if (!window.confirm(verb)) return;
    const result = await bulkActionAction(resource.id, resource.softDelete ? 'trash' : 'destroy', [id]);
    if (result.ok) router.push(`/admin/${resource.id}`);
    else setMessage({ tone: 'error', text: result.message });
  }

  async function restore(revisionId: string) {
    if (!id || !window.confirm('Restore this version? The current content is kept as a version too.')) return;
    const result = await restoreRevisionAction(resource.id, id, revisionId);
    if (result.ok && result.record) {
      setValues(result.record);
      setSaved(result.record);
      setState('saved');
      setMessage({ tone: 'success', text: result.message });
      router.refresh();
    } else if (!result.ok) setMessage({ tone: 'error', text: result.message });
  }

  const errorTabs = new Set(Object.keys(errors).map((k) => fields.find((f) => k === f.name || k.startsWith(`${f.name}.`))?.tab ?? 'Content'));
  const title = String(getPath(values, resource.titleField) ?? '') || `New ${resource.label.toLowerCase()}`;
  const status = resource.statusField ? String(getPath(saved, resource.statusField) ?? '') : '';
  const deleted = Boolean(saved.deletedAt);

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      noValidate
      className="pb-24"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <button type="button" onClick={() => leave(`/admin/${resource.id}`)} className="text-sm text-primary underline">
            {resource.labelPlural}
          </button>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-2xl font-semibold text-ink">
            <span className="break-all">{title}</span>
            {status ? <StatusChip value={status} /> : null}
          </h1>
          {deleted ? <p className="mt-1 text-sm text-warning">This item is in Trash. Restore it from the Trash list to use it again.</p> : null}
        </div>
        {id ? (
          <div className="flex flex-wrap gap-2">
            {liveUrl && status === 'PUBLISHED' ? (
              <a className="inline-flex min-h-10 items-center rounded-button border border-line px-3 text-sm text-ink" href={liveUrl} target="_blank" rel="noreferrer">
                View live
              </a>
            ) : null}
            {previewUrl && status !== 'PUBLISHED' ? (
              <a className="inline-flex min-h-10 items-center rounded-button border border-line px-3 text-sm text-ink" href={previewUrl} target="_blank" rel="noreferrer">
                Preview
              </a>
            ) : null}
            {resource.revisions ? <Button onClick={() => setShowRevisions((s) => !s)} aria-expanded={showRevisions}>Versions ({revisions.length})</Button> : null}
            {resource.duplicate && !readOnly ? <Button onClick={() => void duplicate()}>Duplicate</Button> : null}
            {!readOnly && resource.deletable !== false && !deleted ? (
              <Button variant="danger" onClick={() => void trash()}>
                {resource.softDelete ? 'Move to Trash' : 'Delete'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {message ? (
        <div className="mt-4">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          {tabs.length > 1 ? (
            <div role="tablist" aria-label="Sections" className="flex flex-wrap gap-1 border-b border-line">
              {tabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  id={`tab-${t}`}
                  aria-selected={tab === t}
                  aria-controls={`panel-${t}`}
                  onClick={() => setTab(t)}
                  className={`-mb-px min-h-10 border-b-2 px-3 text-sm ${tab === t ? 'border-primary font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}
                >
                  {t}
                  {errorTabs.has(t) ? <span className="ml-1 text-danger" aria-label="has errors">•</span> : null}
                </button>
              ))}
            </div>
          ) : null}
          {tabs.map((t) => (
            <div key={t} role="tabpanel" id={`panel-${t}`} aria-labelledby={`tab-${t}`} hidden={tab !== t} className="mt-6">
              {seoInfo && tab === t && (t === 'SEO' || t === 'Social' || t === 'Schema') ? (
                <div className="mb-6">
                  <SeoPanel resourceId={resource.id} id={id} values={values} fieldNames={fields.map((f) => f.name)} tab={t} siteName={seoInfo.siteName} siteUrl={seoInfo.siteUrl} path={liveUrl} />
                </div>
              ) : null}
              <div className="grid gap-5 sm:grid-cols-2">
                {fields
                  .filter((f) => (f.tab ?? 'Content') === t)
                  .map((f) => (
                    <FieldControl
                      key={f.name}
                      field={readOnly ? { ...f, readOnly: true } : f}
                      value={getPath(values, f.name)}
                      onChange={(v) => update(f.name, v)}
                      error={errors[f.name]}
                      errors={errors}
                      record={values}
                      timeZone={timeZone}
                      isAdmin={isAdmin}
                      liveModules={liveModules}
                    />
                  ))}
              </div>
            </div>
          ))}
        </div>

        {showRevisions && id ? (
          <aside aria-label="Versions" className="rounded-card border border-line bg-surface p-4">
            <h2 className="font-display text-base font-semibold text-ink">Versions</h2>
            <p className="mt-1 text-xs text-muted">The last 30 saves. Restoring saves a new version, so nothing is lost.</p>
            {revisions.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No versions yet.</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {revisions.map((r, i) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {formatDate(r.createdAt, timeZone)}
                      <span className="block text-xs text-muted">
                        {r.by}
                        {i === 0 ? ' · current' : ''}
                      </span>
                    </span>
                    {i > 0 ? (
                      <Button variant="ghost" onClick={() => void restore(r.id)}>
                        Restore
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </aside>
        ) : null}
      </div>

      {readOnly ? null : (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface md:left-64" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <div className="flex items-center justify-between gap-3 px-6 py-3">
            <p role="status" aria-live="polite" className={`text-sm ${state === 'unsaved' || dirty ? 'text-warning' : 'text-muted'}`}>
              {state === 'saving' ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}
              <span className="ml-2 hidden text-xs text-muted sm:inline">Ctrl or Cmd + S saves</span>
            </p>
            <div className="flex gap-2">
              <Link href={`/admin/${resource.id}`} onClick={(e) => { e.preventDefault(); leave(`/admin/${resource.id}`); }} className="inline-flex min-h-10 items-center rounded-button px-3 text-sm text-body hover:bg-raised">
                Close
              </Link>
              <Button type="submit" variant="primary" disabled={state === 'saving' || (!dirty && Boolean(id))}>
                {id ? 'Save changes' : `Create ${resource.label.toLowerCase()}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
