'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { rescoreAllAction } from '@/lib/seo/actions';
import { Button } from '@/components/admin/ui';

export function RescoreButton() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-3">
      {message ? <span role="status" className="text-sm text-muted">{message}</span> : null}
      <Button variant="primary" disabled={pending} onClick={() => start(async () => { const r = await rescoreAllAction(); setMessage(r.message); router.refresh(); })}>
        {pending ? 'Scoring…' : 'Score everything again'}
      </Button>
    </div>
  );
}
