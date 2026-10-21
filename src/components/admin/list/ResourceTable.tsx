'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { bulkActionAction, deleteViewAction, duplicateAction, quickEditAction, saveViewAction } from '@/lib/admin/actions';
import { getPath, setPath, type FieldDef } from '@/lib/admin/fields';
import type { ClientResource, ColumnDef } from '@/lib/admin/resource';
import type { BulkAction } from '@/lib/admin/repo';
import { FieldControl } from '../fields/FieldControl';
import { formatDate, formatMoney } from '../format';
import { Button, Notice, StatusChip } from '../ui';
import { STATUS_LABEL, STATUS_TONE, type OrderStatusId } from '@/lib/checkout/status';
import { SUB_STATUS_LABEL, SUB_STATUS_TONE, type SubStatusId } from '@/lib/subscriptions/schedule';

interface Props {
  resource: ClientResource;
  quickFields: FieldDef[];
  rows: Record<string, unknown>[];
  columns: string[];
  view: 'all' | 'trash';
  timeZone: string;
  isAdmin: boolean;
  currentHref: string;
  /** Builds a list address with other columns chosen. */
  columnHrefs: Record<string, string>;
  savedViews: { name: string; href: string }[];
}

function Cell({ column, row, timeZone, resourceId }: { column: ColumnDef; row: Record<string, unknown>; timeZone: string; resourceId: string }) {
  const value = getPath(row, column.field);
  switch (column.kind) {
    case 'title':
      return (
        <Link href={`/admin/${resourceId}/${encodeURIComponent(String(row.id))}`} className="font-medium text-ink underline-offset-2 hover:underline">
          {String(value ?? '') || 'Untitled'}
        </Link>
      );
    case 'status':
      return value ? <StatusChip value={String(value)} /> : null;
    case 'boolean':
      return <span className={value ? 'text-success' : 'text-muted'}>{value ? 'Yes' : 'No'}</span>;
    case 'date':
      return <span className="whitespace-nowrap text-muted">{formatDate(value, timeZone)}</span>;
    case 'money':
      return <span>{formatMoney(value, String(row.currency ?? 'USD'))}</span>;
    case 'tags':
      return <span className="text-muted">{Array.isArray(value) ? value.join(', ') : ''}</span>;
    case 'orderStatus': {
      const label = STATUS_LABEL[String(value) as OrderStatusId] ?? String(value);
      const tone = STATUS_TONE[String(value) as OrderStatusId] ?? 'muted';
      const cls = tone === 'success' ? 'border-success text-success' : tone === 'danger' ? 'border-danger text-danger' : tone === 'warning' ? 'border-warning text-warning' : 'border-line text-muted';
      return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
    }
    case 'subscriptionStatus': {
      const id = String(value) as SubStatusId;
      const label = SUB_STATUS_LABEL[id] ?? String(value);
      const tone = SUB_STATUS_TONE[id] ?? 'muted';
      const cls = tone === 'success' ? 'border-success text-success' : tone === 'danger' ? 'border-danger text-danger' : tone === 'warning' ? 'border-warning text-warning' : 'border-line text-muted';
      return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}{row.cancelAtPeriodEnd && id === 'ACTIVE' ? ', not renewing' : ''}</span>;
    }
    case 'seoScore': {
      const n = typeof value === 'number' ? value : null;
      if (n === null) return <span className="text-muted">Not scored</span>;
      const tone = n >= 80 ? 'border-success text-success' : n >= 60 ? 'border-warning text-warning' : 'border-danger text-danger';
      return <span className={`inline-flex min-w-10 justify-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`} title={`SEO score ${n} out of 100`}>{n}</span>;
    }
    case 'code':
      return <code className="break-all font-mono text-xs">{String(value ?? '')}</code>;
    case 'thumb':
      // eslint-disable-next-line @next/next/no-img-element
      return value ? <img src={String(value)} alt="" className="h-10 w-10 rounded-input object-cover" /> : null;
    default:
      return <span>{String(value ?? '')}</span>;
  }
}

/** The generic list: selection, bulk actions, quick edit, duplicate, Trash, columns and saved views. */
export function ResourceTable({ resource, quickFields, rows, columns, view, timeZone, isAdmin, currentHref, columnHrefs, savedViews }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [viewName, setViewName] = useState('');
  const [pending, startTransition] = useTransition();
  const cols = resource.columns.filter((c) => columns.includes(c.field));
  const ids = rows.map((r) => String(r.id));
  const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
  const editable = !resource.readOnly || resource.deletable === true;

  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    startTransition(async () => {
      const result = await fn();
      setMessage({ tone: result.ok ? 'success' : 'error', text: result.message });
      if (result.ok) {
        after?.();
        router.refresh();
      }
    });

  const bulk = (action: BulkAction) => {
    if (action === 'destroy' && !window.confirm(`Delete ${selected.length} item(s) for good? This cannot be undone.`)) return;
    run(() => bulkActionAction(resource.id, action, selected), () => setSelected([]));
  };

  const startQuickEdit = (row: Record<string, unknown>) => {
    setEditing(String(row.id));
    setDraft(row);
    setErrors({});
  };

  const saveQuickEdit = (id: string) =>
    startTransition(async () => {
      const values: Record<string, unknown> = {};
      for (const f of quickFields) values[f.name] = getPath(draft, f.name);
      const result = await quickEditAction(resource.id, id, values);
      if (result.ok) {
        setEditing(null);
        setMessage({ tone: 'success', text: result.message });
        router.refresh();
      } else {
        setErrors(result.errors);
        setMessage({ tone: 'error', text: result.message });
      }
    });

  const exportHref = `/api/admin/${resource.id}/export?${selected.length ? `ids=${selected.join(',')}` : view === 'trash' ? 'view=trash' : ''}`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <details className="relative">
            <summary className="inline-flex min-h-10 cursor-pointer list-none items-center rounded-button border border-line bg-surface px-3 text-sm text-ink">Columns</summary>
            <ul className="absolute z-10 mt-1 w-56 rounded-card border border-line bg-surface p-2 shadow-lg">
              {resource.columns.map((c) => (
                <li key={c.field}>
                  <Link href={columnHrefs[c.field] ?? currentHref} className="flex min-h-9 items-center gap-2 rounded-button px-2 text-sm hover:bg-raised">
                    <span aria-hidden="true" className="w-4 text-primary">{columns.includes(c.field) ? '✓' : ''}</span>
                    {c.label}
                    <span className="sr-only">{columns.includes(c.field) ? '(shown)' : '(hidden)'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
          <details className="relative">
            <summary className="inline-flex min-h-10 cursor-pointer list-none items-center rounded-button border border-line bg-surface px-3 text-sm text-ink">Saved views</summary>
            <div className="absolute z-10 mt-1 w-72 rounded-card border border-line bg-surface p-3 shadow-lg">
              {savedViews.length ? (
                <ul className="mb-3 space-y-1">
                  {savedViews.map((v) => (
                    <li key={v.name} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={v.href} className="text-primary underline">
                        {v.name}
                      </Link>
                      <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => run(() => deleteViewAction(resource.id, v.name))}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-3 text-xs text-muted">Save the current search, filters, sort and columns to come back to them.</p>
              )}
              <label className="block text-xs font-medium text-muted" htmlFor="view-name">
                Name this view
              </label>
              <div className="mt-1 flex gap-2">
                <input id="view-name" className="min-h-9 w-full rounded-input border border-line bg-base px-2 text-sm text-ink" value={viewName} maxLength={40} onChange={(e) => setViewName(e.target.value)} />
                <Button disabled={!viewName.trim()} onClick={() => run(() => saveViewAction(resource.id, viewName, currentHref), () => setViewName(''))}>
                  Save
                </Button>
              </div>
            </div>
          </details>
        </div>
        <a href={exportHref} className="inline-flex min-h-10 items-center rounded-button border border-line bg-surface px-3 text-sm text-ink">
          Export CSV{selected.length ? ` (${selected.length})` : ''}
        </a>
      </div>

      {message ? (
        <div className="mt-3">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      ) : null}

      {selected.length && editable ? (
        <div role="region" aria-label="Bulk actions" className="mt-3 flex flex-wrap items-center gap-2 rounded-card border border-primary bg-surface px-3 py-2">
          <span className="text-sm font-medium text-ink">{selected.length} selected</span>
          {view === 'trash' ? (
            <>
              <Button onClick={() => bulk('restore')} disabled={pending}>Restore</Button>
              <Button variant="danger" onClick={() => bulk('destroy')} disabled={pending}>Delete for good</Button>
            </>
          ) : (
            <>
              {resource.statusField ? (
                <>
                  <Button onClick={() => bulk('publish')} disabled={pending}>Publish</Button>
                  <Button onClick={() => bulk('draft')} disabled={pending}>Switch to draft</Button>
                </>
              ) : null}
              {resource.duplicate ? <Button onClick={() => bulk('duplicate')} disabled={pending}>Duplicate</Button> : null}
              {resource.deletable !== false ? (
                resource.softDelete ? (
                  <Button variant="danger" onClick={() => bulk('trash')} disabled={pending}>Move to Trash</Button>
                ) : (
                  <Button variant="danger" onClick={() => bulk('destroy')} disabled={pending}>Delete</Button>
                )
              ) : null}
            </>
          )}
          <Button variant="ghost" onClick={() => setSelected([])}>Clear</Button>
        </div>
      ) : null}

      <div className="mt-3 overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-line text-xs text-muted">
            <tr>
              {editable ? (
                <th scope="col" className="w-10 px-3 py-2">
                  <input type="checkbox" aria-label="Select all on this page" className="h-4 w-4 accent-primary" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? ids : [])} />
                </th>
              ) : null}
              {cols.map((c) => (
                <th key={c.field} scope="col" className="px-3 py-2 font-medium">
                  {c.label}
                </th>
              ))}
              {editable ? <th scope="col" className="px-3 py-2 text-right font-medium"><span className="sr-only">Actions</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={cols.length + 2} className="px-3 py-10 text-center text-muted">
                  {view === 'trash' ? 'Trash is empty.' : 'Nothing here yet.'}
                </td>
              </tr>
            ) : null}
            {rows.map((row) => {
              const id = String(row.id);
              if (editing === id) {
                return (
                  <tr key={id} className="border-b border-line bg-raised last:border-0">
                    <td colSpan={cols.length + 2} className="p-4">
                      <p className="mb-3 text-sm font-medium text-ink">Quick edit</p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {quickFields.map((f) => (
                          <FieldControl key={f.name} field={{ ...f, width: 'half' }} value={getPath(draft, f.name)} onChange={(v) => setDraft((d) => setPath(d, f.name, v))} error={errors[f.name]} record={draft} timeZone={timeZone} isAdmin={isAdmin} />
                        ))}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button variant="primary" onClick={() => saveQuickEdit(id)} disabled={pending}>
                          Save
                        </Button>
                        <Button variant="ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={id} className="border-b border-line last:border-0 hover:bg-raised">
                  {editable ? (
                    <td className="px-3 py-2">
                      <input type="checkbox" aria-label={`Select ${String(getPath(row, resource.titleField) ?? id)}`} className="h-4 w-4 accent-primary" checked={selected.includes(id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, id] : s.filter((x) => x !== id)))} />
                    </td>
                  ) : null}
                  {cols.map((c) => (
                    <td key={c.field} className="px-3 py-2 align-middle">
                      <Cell column={c} row={row} timeZone={timeZone} resourceId={resource.id} />
                    </td>
                  ))}
                  {editable ? (
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {view === 'trash' ? (
                        <Button variant="ghost" onClick={() => run(() => bulkActionAction(resource.id, 'restore', [id]))}>Restore</Button>
                      ) : (
                        <>
                          {resource.rowLink ? (
                            <Link className="inline-flex min-h-10 items-center rounded-button px-3 text-sm text-primary underline" href={resource.rowLink.href.replace(/\{(\w+)\}/g, (_m, k: string) => encodeURIComponent(String(row[k] ?? '')))}>
                              {resource.rowLink.label}
                            </Link>
                          ) : null}
                          {quickFields.length ? <Button variant="ghost" onClick={() => startQuickEdit(row)}>Quick edit</Button> : null}
                          {resource.duplicate ? (
                            <Button variant="ghost" onClick={() => run(() => duplicateAction(resource.id, id))}>Duplicate</Button>
                          ) : null}
                        </>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
