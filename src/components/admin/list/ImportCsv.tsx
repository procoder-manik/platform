'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button, Notice } from '../ui';

interface Report {
  created: number;
  updated: number;
  failed: { row: number; message: string }[];
}

/** CSV import for resources that declare an import key. Rows go through the normal save and validation. */
export function ImportCsv({ resourceId, columns, importKey }: { resourceId: string; columns: readonly string[]; importKey: string }) {
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const response = await fetch(`/api/admin/${resourceId}/import`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: await file.text() });
      const body = (await response.json()) as { ok: boolean; report?: Report; message?: string };
      if (!body.ok || !body.report) throw new Error(body.message ?? 'The import failed.');
      setReport(body.report);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The import failed.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div>
      <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="CSV file to import" onChange={(e) => void onFile(e.target.files?.[0])} />
      <Button onClick={() => input.current?.click()} disabled={busy} title={`Columns: ${columns.join(', ')}. Rows are matched on "${importKey}".`}>
        {busy ? 'Importing…' : 'Import CSV'}
      </Button>
      {error ? <div className="mt-2"><Notice tone="error">{error}</Notice></div> : null}
      {report ? (
        <div className="mt-2">
          <Notice tone={report.failed.length ? 'warning' : 'success'}>
            {report.created} added, {report.updated} updated{report.failed.length ? `, ${report.failed.length} skipped` : ''}.
            {report.failed.length ? (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {report.failed.slice(0, 10).map((f) => (
                  <li key={f.row}>Row {f.row}: {f.message}</li>
                ))}
              </ul>
            ) : null}
          </Notice>
        </div>
      ) : null}
    </div>
  );
}
