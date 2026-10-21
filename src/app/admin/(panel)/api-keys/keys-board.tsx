'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { clearKeyAction, saveKeyAction, type KeyStatus } from '@/lib/security/key-actions';
import { Button, Notice, inputClass } from '@/components/admin/ui';

interface Def {
  name: string;
  label: string;
  group: string;
  help: string;
}

export function KeysBoard({ keys, status }: { keys: Def[]; status: KeyStatus[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ name: string; ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const groups = [...new Set(keys.map((k) => k.group))];

  const run = (name: string, fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      setMessage({ name, ok: r.ok, text: r.message });
      if (r.ok) {
        setValues((v) => ({ ...v, [name]: '' }));
        router.refresh();
      }
    });

  return (
    <div className="mt-6 space-y-8">
      {groups.map((group) => (
        <section key={group} aria-labelledby={`g-${group}`} className="rounded-card border border-line bg-surface p-5">
          <h2 id={`g-${group}`} className="font-display text-lg font-semibold text-ink">{group}</h2>
          <div className="mt-4 space-y-5">
            {keys.filter((k) => k.group === group).map((k) => {
              const s = status.find((x) => x.name === k.name);
              const id = `key-${k.name}`;
              return (
                <div key={k.name}>
                  <label htmlFor={id} className="block text-sm font-medium text-ink">{k.label}</label>
                  <p className="mt-0.5 text-xs text-muted">{k.help}</p>
                  <p className="mt-1 text-sm" aria-live="polite">
                    {s?.source === 'env' ? <span className="text-success">Set in the environment ({s.masked}). Managed there.</span> : s?.source === 'saved' ? <span className="text-success">Saved ({s.masked})</span> : <span className="text-warning">Not set</span>}
                  </p>
                  {s?.source !== 'env' ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input id={id} type="password" autoComplete="off" className={`${inputClass} max-w-md flex-1`} placeholder={s?.source === 'saved' ? 'Enter a new value to replace it' : 'Paste the key'} value={values[k.name] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [k.name]: e.target.value }))} />
                      <Button variant="primary" disabled={pending || !(values[k.name] ?? '').trim()} onClick={() => run(k.name, () => saveKeyAction(k.name, values[k.name] ?? ''))}>Save</Button>
                      {s?.source === 'saved' ? <Button variant="danger" disabled={pending} onClick={() => window.confirm(`Remove ${k.label}?`) && run(k.name, () => clearKeyAction(k.name))}>Remove</Button> : null}
                    </div>
                  ) : null}
                  {message?.name === k.name ? <div className="mt-2"><Notice tone={message.ok ? 'success' : 'error'}>{message.text}</Notice></div> : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
