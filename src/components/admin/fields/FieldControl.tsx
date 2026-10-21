'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import type { FieldDef } from '@/lib/admin/fields';
import { getPath, isVisible } from '@/lib/admin/fields';
import { slugify } from '@/lib/admin/slug';
import { fromLocalInput, toLocalInput } from '../format';
import { Button, inputClass } from '../ui';
import { MediaPicker } from '../media/MediaPicker';
import { BlockBuilder } from '../builder/BlockBuilder';
import { RichTextEditor } from './RichTextEditor';
import type { Block } from '@/lib/blocks/types';
import { FONT_CHOICES } from '@/lib/theme/font-catalog';
import { ICON_NAMES } from '../../site/Icon';

export interface FieldProps {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
  /** The whole record, for slug sources and conditions. */
  record: Record<string, unknown>;
  timeZone: string;
  isAdmin: boolean;
  /** Errors for nested paths, used by repeaters. */
  errors?: Record<string, string>;
  path?: string;
  /** Live module ids, for the page builder palette. */
  liveModules?: string[];
}

const ICONS = ICON_NAMES;

const asString = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const asArray = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

/** One field: label, control, help text and the error right next to it. */
export function FieldControl(props: FieldProps) {
  const { field, error } = props;
  const id = useId();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  if (field.adminOnly && !props.isAdmin) return null;
  if (!isVisible(field, props.record)) return null;

  if (field.type === 'note') {
    return (
      <div className="rounded-input border border-line bg-raised px-3 py-2 text-sm sm:col-span-2">
        <p className="font-medium text-ink">{field.label}</p>
        <p className="mt-1">{field.info}</p>
      </div>
    );
  }

  const describedBy = error ? `${helpId} ${errorId}` : helpId;
  const common = { id, 'aria-describedby': describedBy, 'aria-invalid': Boolean(error), disabled: field.readOnly };
  const isCheck = field.type === 'switch';

  return (
    <div className={field.width === 'half' ? '' : 'sm:col-span-2'} data-field={props.path ?? field.name}>
      {isCheck ? null : (
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {field.label}
          {field.required ? <span className="text-danger"> *</span> : null}
        </label>
      )}
      <div className={isCheck ? '' : 'mt-1'}>
        <Control {...props} common={common} id={id} />
      </div>
      <p id={helpId} className="mt-1 text-xs text-muted">
        {field.info}
      </p>
      {error ? (
        <p id={errorId} className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Common = { id: string; 'aria-describedby': string; 'aria-invalid': boolean; disabled?: boolean };

function Control({ field, value, onChange, record, timeZone, isAdmin, errors, path, common, id, liveModules }: FieldProps & { common: Common; id: string }): ReactNode {
  switch (field.type) {
    case 'blocks':
      return <BlockBuilder value={Array.isArray(value) ? (value as Block[]) : []} onChange={onChange} isAdmin={isAdmin} timeZone={timeZone} liveModules={liveModules ?? ['core']} errors={errors} fieldName={field.name} />;
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
    case 'icon':
      return (
        <>
          <input
            {...common}
            type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : field.type === 'phone' ? 'tel' : 'text'}
            list={field.type === 'icon' ? `${id}-icons` : undefined}
            className={inputClass}
            value={asString(value)}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.type === 'icon' ? (
            <datalist id={`${id}-icons`}>
              {ICONS.map((i) => (
                <option key={i} value={i} />
              ))}
            </datalist>
          ) : null}
        </>
      );
    case 'password':
      return <input {...common} type="password" autoComplete="new-password" className={inputClass} value={asString(value)} onChange={(e) => onChange(e.target.value)} />;
    case 'richtext':
      return <RichTextEditor id={common.id} value={value} onChange={onChange} describedBy={common['aria-describedby']} disabled={common.disabled} />;
    case 'textarea':
      return (
        <textarea
          {...common}
          rows={(field.maxLength ?? 0) > 2000 ? 8 : 3}
          className={`${inputClass} py-2`}
          value={asString(value)}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'code':
    case 'json':
      return <CodeInput common={common} value={value} onChange={onChange} json={field.type === 'json'} />;
    case 'number':
      return <input {...common} type="number" inputMode="decimal" className={inputClass} value={asString(value)} min={field.min} max={field.max} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
    case 'money':
      return (
        <div className="flex items-center gap-2">
          <input
            {...common}
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            className={inputClass}
            value={value === null || value === undefined || value === '' ? '' : (Number(value) / 100).toFixed(2)}
            onChange={(e) => onChange(e.target.value === '' ? null : Math.round(Number(e.target.value) * 100))}
          />
          <span className="text-sm text-muted">{asString(field.currency && field.currency.length === 3 ? field.currency : getPath(record, field.currency ?? 'currency')) || 'USD'}</span>
        </div>
      );
    case 'switch':
      return (
        <label className="flex min-h-10 cursor-pointer items-center gap-3">
          <input {...common} type="checkbox" className="h-5 w-5 accent-primary" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          <span className="text-sm font-medium text-ink">{field.label}</span>
        </label>
      );
    case 'select':
      return (
        <select {...common} className={inputClass} value={asString(value)} onChange={(e) => onChange(e.target.value)}>
          {field.required ? null : <option value="">None</option>}
          {field.required && !value ? <option value="">Choose…</option> : null}
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'segmented':
      return (
        <div role="radiogroup" aria-labelledby={undefined} aria-describedby={common['aria-describedby']} className="inline-flex flex-wrap rounded-button border border-line bg-base p-0.5">
          {(field.options ?? []).map((o) => {
            const on = asString(value) === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={common.disabled}
                id={on ? common.id : undefined}
                onClick={() => onChange(o.value)}
                className={`min-h-9 rounded-button px-3 text-sm ${on ? 'bg-primary text-primary-ink' : 'text-body hover:bg-raised'}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );
    case 'multiselect': {
      const selected = asArray(value);
      return (
        <fieldset className="grid gap-1 sm:grid-cols-3" aria-describedby={common['aria-describedby']}>
          <legend className="sr-only">{field.label}</legend>
          {(field.options ?? []).map((o) => (
            <label key={o.value} className="flex min-h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={selected.includes(o.value)}
                disabled={common.disabled}
                onChange={(e) => onChange(e.target.checked ? [...selected, o.value] : selected.filter((v) => v !== o.value))}
              />
              {o.label}
            </label>
          ))}
        </fieldset>
      );
    }
    case 'tags':
      return <TagsInput common={common} value={asArray(value)} onChange={onChange} placeholder={field.placeholder} />;
    case 'date':
      return <input {...common} type="date" className={inputClass} value={value ? toLocalInput(value, timeZone).slice(0, 10) : ''} onChange={(e) => onChange(e.target.value || null)} />;
    case 'datetime':
      return (
        <div>
          <input {...common} type="datetime-local" className={inputClass} value={toLocalInput(value, timeZone)} onChange={(e) => onChange(fromLocalInput(e.target.value, timeZone))} />
          <p className="mt-1 text-xs text-muted">Time zone: {timeZone}</p>
        </div>
      );
    case 'color':
      // The colour field edits colour values as data, so raw hex values are expected here.
      return (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line platform/no-raw-colors */}
          <input type="color" aria-label={`${field.label} picker`} className="h-10 w-12 rounded-input border border-line bg-base" value={/^#[0-9a-fA-F]{6}$/.test(asString(value)) ? asString(value) : '#000000'} onChange={(e) => onChange(e.target.value)} disabled={common.disabled} />
          {/* eslint-disable-next-line platform/no-raw-colors */}
          <input {...common} className={inputClass} value={asString(value)} placeholder="#1d5bd8" onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case 'font':
      return (
        <select {...common} className={inputClass} value={asString(value)} onChange={(e) => onChange(e.target.value)}>
          <option value="">System font</option>
          {FONT_CHOICES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      );
    case 'slug':
      return (
        <div className="flex gap-2">
          <input {...common} className={`${inputClass} font-mono`} value={asString(value)} placeholder="my-page" onChange={(e) => onChange(e.target.value.toLowerCase())} />
          <Button onClick={() => onChange(slugify(asString(getPath(record, field.from ?? 'title'))))} disabled={common.disabled}>
            From {field.from ?? 'title'}
          </Button>
        </div>
      );
    case 'image':
    case 'file':
      return <MediaPicker common={common} value={asString(value) || null} onChange={onChange} accept={field.type === 'image' ? 'image' : 'any'} />;
    case 'gallery':
      return <MediaPicker common={common} multiple values={asArray(value)} onChangeMany={onChange} accept="image" />;
    case 'relation':
      return <RelationInput common={common} field={field} value={value} onChange={onChange} />;
    case 'repeater':
      return <RepeaterInput field={field} value={value} onChange={onChange} timeZone={timeZone} isAdmin={isAdmin} errors={errors} path={path ?? field.name} />;
    default:
      return null;
  }
}

function CodeInput({ common, value, onChange, json }: { common: Common; value: unknown; onChange: (v: unknown) => void; json: boolean }) {
  const [text, setText] = useState(() => (json ? JSON.stringify(value ?? null, null, 2) : asString(value)));
  const [bad, setBad] = useState(false);
  return (
    <>
      <textarea
        {...common}
        spellCheck={false}
        rows={10}
        className={`${inputClass} py-2 font-mono text-xs`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (!json) return onChange(e.target.value);
          try {
            onChange(JSON.parse(e.target.value || 'null'));
            setBad(false);
          } catch {
            setBad(true);
            onChange(e.target.value);
          }
        }}
      />
      {bad ? <p className="mt-1 text-xs text-warning">Not valid JSON yet. It will not save until it is.</p> : null}
    </>
  );
}

function TagsInput({ common, value, onChange, placeholder }: { common: Common; value: string[]; onChange: (v: unknown) => void; placeholder?: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft.split(',').map((t) => t.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])]);
    setDraft('');
  };
  return (
    <div className="rounded-input border border-line bg-base p-1.5">
      <ul className="flex flex-wrap gap-1">
        {value.map((tag) => (
          <li key={tag} className="inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-sm text-ink">
            {tag}
            <button type="button" aria-label={`Remove ${tag}`} className="min-h-6 min-w-6 text-muted hover:text-danger" onClick={() => onChange(value.filter((t) => t !== tag))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <input
        {...common}
        className="mt-1 min-h-8 w-full bg-transparent px-1.5 text-sm text-ink outline-none"
        placeholder={placeholder ?? 'Type and press Enter'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={add}
      />
    </div>
  );
}

function RelationInput({ common, field, value, onChange }: { common: Common; field: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [q, setQ] = useState('');
  const multiple = field.relation?.multiple === true;
  const selected = multiple ? asArray(value) : asString(value) ? [asString(value)] : [];
  useEffect(() => {
    const resource = field.relation?.resource;
    if (!resource) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/admin/${resource}/options?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((d: { options?: { value: string; label: string }[] }) => setOptions(d.options ?? []))
        .catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, field.relation?.resource]);
  const label = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  return (
    <div>
      {selected.length ? (
        <ul className="mb-1 flex flex-wrap gap-1">
          {selected.map((v) => (
            <li key={v} className="inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-sm text-ink">
              {label(v)}
              <button type="button" aria-label={`Remove ${label(v)}`} className="min-h-6 min-w-6 text-muted" onClick={() => onChange(multiple ? selected.filter((s) => s !== v) : null)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <input {...common} className={inputClass} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      {options.length ? (
        <ul className="mt-1 max-h-48 overflow-auto rounded-input border border-line bg-surface">
          {options.filter((o) => !selected.includes(o.value)).map((o) => (
            <li key={o.value}>
              <button type="button" className="block min-h-9 w-full px-3 text-left text-sm hover:bg-raised" onClick={() => onChange(multiple ? [...selected, o.value] : o.value)}>
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RepeaterInput({ field, value, onChange, timeZone, isAdmin, errors, path }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void; timeZone: string; isAdmin: boolean; errors?: Record<string, string>; path: string }) {
  const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  const update = (index: number, next: Record<string, unknown>) => onChange(rows.map((r, i) => (i === index ? next : r)));
  const move = (index: number, by: number) => {
    const target = index + by;
    if (target < 0 || target >= rows.length) return;
    const copy = [...rows];
    [copy[index], copy[target]] = [copy[target] as Record<string, unknown>, copy[index] as Record<string, unknown>];
    onChange(copy);
  };
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <fieldset key={index} className="rounded-card border border-line p-4">
          <legend className="px-1 text-sm font-medium text-ink">
            {field.label} {index + 1}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {(field.fields ?? []).map((sub) => (
              <FieldControl
                key={sub.name}
                field={sub}
                value={row[sub.name]}
                onChange={(v) => update(index, { ...row, [sub.name]: v })}
                record={row}
                timeZone={timeZone}
                isAdmin={isAdmin}
                error={errors?.[`${path}.${index}.${sub.name}`]}
                path={`${path}.${index}.${sub.name}`}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => move(index, -1)} disabled={index === 0}>
              Move up
            </Button>
            <Button variant="ghost" onClick={() => move(index, 1)} disabled={index === rows.length - 1}>
              Move down
            </Button>
            <Button variant="ghost" onClick={() => onChange([...rows.slice(0, index + 1), { ...row }, ...rows.slice(index + 1)])}>
              Duplicate
            </Button>
            <Button variant="danger" onClick={() => onChange(rows.filter((_, i) => i !== index))}>
              Remove
            </Button>
          </div>
        </fieldset>
      ))}
      <Button onClick={() => onChange([...rows, {}])}>Add {field.label.toLowerCase()}</Button>
    </div>
  );
}
