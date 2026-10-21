import { requireAreaPage } from '@/lib/auth/guards';
import { effectiveStates } from '@/lib/modules/logic';
import { getChosenModuleStates, MODULE_METAS } from '@/lib/modules/server';
import { ModulesBoard } from './modules-board';

export const metadata = { title: 'Modules' };

export default async function ModulesPage() {
  await requireAreaPage('modules');
  const chosen = await getChosenModuleStates();
  const production = process.env.NODE_ENV === 'production';
  const metas = MODULE_METAS.filter((m) => !(m.devOnly && production));
  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-2xl font-semibold text-ink">Modules</h1>
      <p className="mt-2 max-w-prose">
        Switch feature groups on or off. A module that is off disappears from the site, the admin, the sitemap and
        search. Its data is kept, so switching it back on restores everything.
      </p>
      <ModulesBoard metas={metas} initialChosen={chosen} initialEffective={effectiveStates(MODULE_METAS, chosen)} />
    </div>
  );
}
