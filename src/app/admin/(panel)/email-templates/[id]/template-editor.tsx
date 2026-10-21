'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { previewTemplateAction, resetTemplateAction, saveTemplateAction, sendTestEmailAction } from '@/lib/mail/admin-actions';
import { Button, Notice, PageHeader, inputClass } from '@/components/admin/ui';
import type { Placeholder, TemplateId } from '@/lib/mail/templates';

interface Props {
  id: TemplateId;
  group: string;
  defaultSubject: string;
  defaultBody: string;
  subject: string;
  body: string;
  customised: boolean;
  placeholders: Placeholder[];
  to: 'customer' | 'owner';
}

/** Edits one email template: subject and body, a live preview rendered in your brand colours, and a test send to yourself. */
export function TemplateEditor({ id, group, defaultSubject, defaultBody, subject: initialSubject, body: initialBody, customised: initialCustomised, placeholders, to }: Props) {
  const router = useRouter();
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [customised, setCustomised] = useState(initialCustomised);
  const [pending, start] = useTransition();
  const [testPending, startTest] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<{ html: string; warnings: string[] } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const seq = useRef(0);

  const dirty = subject !== initialSubject || body !== initialBody;

  useEffect(() => {
    const mine = (seq.current += 1);
    const timer = setTimeout(() => {
      void previewTemplateAction(id, subject, body).then((r) => {
        if (mine !== seq.current) return;
        if (r.ok) {
          setPreview({ html: r.html, warnings: r.warnings });
          setPreviewError('');
        } else setPreviewError(r.message);
      });
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, body]);

  const save = () =>
    start(async () => {
      const r = await saveTemplateAction(id, subject, body);
      setMessage({ ok: r.ok, text: r.message });
      if (r.ok) {
        setCustomised(true);
        router.refresh();
      }
    });

  const reset = () =>
    start(async () => {
      const r = await resetTemplateAction(id);
      setMessage({ ok: r.ok, text: r.message });
      if (r.ok) {
        setSubject(defaultSubject);
        setBody(defaultBody);
        setCustomised(false);
        router.refresh();
      }
    });

  const sendTest = () =>
    startTest(async () => {
      const r = await sendTestEmailAction(id, subject, body);
      setMessage({ ok: r.ok, text: r.message });
    });

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title={id}
        description={`${group} · sent to the ${to === 'owner' ? 'site owner' : 'customer'}.`}
        actions={<Link href="/admin/email-templates" className="inline-flex min-h-10 items-center rounded-button border border-line px-3 text-sm text-ink">All templates</Link>}
      />
      {message ? <Notice tone={message.ok ? 'success' : 'error'}>{message.text}</Notice> : null}
      {customised ? <Notice tone="info">This email uses custom wording. Reset it to go back to the built-in text.</Notice> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <label className="block text-sm font-medium text-ink">Subject<input className={`${inputClass} mt-1`} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} /></label>
          <label className="block text-sm font-medium text-ink">Email text<textarea rows={14} className={`${inputClass} mt-1 py-2 font-mono text-sm`} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} /></label>
          <div>
            <p className="text-sm font-medium text-ink">Placeholders you can use</p>
            <p className="mt-1 flex flex-wrap gap-2">{placeholders.map((p) => <code key={p} className="rounded bg-raised px-1.5 py-0.5 text-xs">{`{${p}}`}</code>)}</p>
            <p className="mt-1 text-sm text-muted">Not every email fills in every placeholder above; unused ones are simply left out of this one.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={pending || !dirty} onClick={save}>Save</Button>
            <Button disabled={pending || !customised} onClick={() => window.confirm('Reset to the built-in wording? Your changes to this email will be lost.') && reset()}>Reset to default</Button>
            <Button disabled={testPending} onClick={sendTest}>{testPending ? 'Sending…' : 'Send me a test'}</Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-ink">Live preview, with sample values</p>
          {previewError ? <Notice tone="error">{previewError}</Notice> : null}
          {preview?.warnings.length ? <Notice tone="warning">{preview.warnings.join(' ')}</Notice> : null}
          <div className="overflow-hidden rounded-card border border-line bg-raised">
            {preview ? <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[32rem] w-full bg-white" /> : <div className="grid h-[32rem] place-items-center text-sm text-muted">Loading preview…</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
