import Link from 'next/link';
import { requireAreaPage } from '@/lib/auth/guards';
import { getModuleStates } from '@/lib/data';
import { MODULE_METAS } from '@/lib/modules/server';

export const metadata = { title: 'Dashboard' };

/** Phase 0 dashboard. Order, lead and SEO cards arrive with their modules; the setup checklist in Phase 13. */
export default async function DashboardPage() {
  await requireAreaPage('overview');
  const states = await getModuleStates();
  const switchable = MODULE_METAS.filter((m) => !m.alwaysOn);
  const onCount = switchable.filter((m) => states[m.id]).length;

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold text-ink">Dashboard</h1>
      <p className="mt-2">The platform foundation is running. Content, shop and marketing screens arrive in later phases.</p>
      <div className="mt-8 rounded-card border border-line bg-surface p-6">
        <h2 className="font-display text-lg font-semibold text-ink">Modules</h2>
        <p className="mt-1">
          {onCount} of {switchable.length} modules are on.
        </p>
        <Link href="/admin/modules" className="mt-4 inline-flex min-h-10 items-center text-primary underline">
          Choose modules
        </Link>
      </div>
    </div>
  );
}
