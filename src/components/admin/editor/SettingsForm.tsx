'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { saveSettingsAction } from '@/lib/admin/actions';
import { getPath, setPath, type FieldDef } from '@/lib/admin/fields';
import { FieldControl } from '../fields/FieldControl';
import { Button, Notice, PageHeader } from '../ui';
import { BrandPanel, presetReset } from './BrandPanel';

interface Props {
  groupKey: string;
  label: string;
  description: string;
  fields: FieldDef[];
  initial: Record<string, unknown>;
  timeZone: string;
  isAdmin: boolean;
  /** Extra helpers for some groups. */
  panel?: 'brand';
}

/** The generic settings screen: same fields, help text and save behaviour as the record editor. */
export function SettingsForm({ groupKey, label, description, fields, initial, timeZone, isAdmin, panel }: Props) {
  const tabs = [...new Set(fields.map((f) => f.tab ?? 'General'))];
  const [tab, setTab] = useState(tabs[0] ?? 'General');
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);

  const save = () =>
    startTransition(async () => {
      const payload: Record<string, unknown> = {};
      for (const f of fields) payload[f.name] = getPath(values, f.name);
      const result = await saveSettingsAction(groupKey, payload);
      setMessage({ tone: result.ok ? 'success' : 'error', text: result.message });
      if (result.ok) {
        setErrors({});
        setSaved(values);
        router.refresh();
      } else setErrors(result.errors);
    });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  return (
    <form
      className="max-w-3xl pb-24"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <PageHeader title={label} description={description} />
      {message ? <div className="mt-4"><Notice tone={message.tone}>{message.text}</Notice></div> : null}
      {panel === 'brand' ? (
        <BrandPanel
          values={values}
          onApplyPreset={(id) => {
            if (!window.confirm('Apply this preset? Colour, font and shape changes you made are reset. Content is not touched.')) return;
            setValues((prev) => ({ ...prev, ...presetReset(id) }));
          }}
        />
      ) : null}
      {tabs.length > 1 ? (
        <div role="tablist" aria-label="Sections" className="mt-6 flex flex-wrap gap-1 border-b border-line">
          {tabs.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px min-h-10 border-b-2 px-3 text-sm ${tab === t ? 'border-primary font-medium text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
              {t}
              {Object.keys(errors).some((k) => fields.find((f) => f.name === k || k.startsWith(`${f.name}.`))?.tab === t) ? <span className="ml-1 text-danger">•</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        {fields.filter((f) => (f.tab ?? 'General') === tab).map((f) => (
          <FieldControl key={f.name} field={f} value={getPath(values, f.name)} onChange={(v) => setValues((prev) => setPath(prev, f.name, v))} error={errors[f.name]} errors={errors} record={values} timeZone={timeZone} isAdmin={isAdmin} />
        ))}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface md:left-64">
        <div className="flex items-center justify-between px-6 py-3">
          <p role="status" aria-live="polite" className={`text-sm ${dirty ? 'text-warning' : 'text-muted'}`}>
            {pending ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}
          </p>
          <Button type="submit" variant="primary" disabled={pending || !dirty}>
            Save settings
          </Button>
        </div>
      </div>
    </form>
  );
}
