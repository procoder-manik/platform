import { notFound } from 'next/navigation';
import { isOn } from '@/lib/modules/server';

/** Rendered per request so a switch change shows at once. */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Demo module' };

/**
 * Development-only page owned by the dummy "demo" module.
 * The proxy already returns the 404 page when Demo is off; this check is the second line of defence.
 */
export default async function DemoPage() {
  if (!(await isOn('demo'))) notFound();
  return (
    <section className="max-w-2xl">
      <h1 className="font-display text-3xl font-semibold text-ink">The demo module is on</h1>
      <p className="mt-4">Switch it off in Admin &gt; Modules and reload this page: it should show the 404 page.</p>
    </section>
  );
}
