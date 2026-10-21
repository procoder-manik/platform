import { notFound } from 'next/navigation';
import { getSetting } from '@/lib/data';
import { isOn } from '@/lib/modules/server';
import { maintenanceSettings } from '@/modules/maintenance/settings';
import { siteSettings } from '@/modules/core/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Back soon', robots: { index: false } };

/** Shown to visitors while the maintenance module is on. Text comes from Settings, Maintenance page. */
export default async function MaintenancePage() {
  if (!(await isOn('maintenance'))) notFound();
  const [text, site] = await Promise.all([getSetting(maintenanceSettings), getSetting(siteSettings)]);
  return (
    <section className="mx-auto max-w-2xl px-5 py-28 text-center sm:px-6">
      <h1>{text.heading}</h1>
      {text.message ? <p className="mt-5 text-lg">{text.message}</p> : null}
      {text.contact && site.contactEmail ? (
        <p className="mt-8">
          <a className="text-primary underline" href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
        </p>
      ) : null}
    </section>
  );
}
