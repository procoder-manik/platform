import { notFound } from 'next/navigation';
import { requireAreaPage } from '@/lib/auth/guards';
import { getSettingsGroup } from '@/lib/settings/registry';
import { getSetting } from '@/lib/settings/store';
import { isOn } from '@/lib/modules/server';
import { siteSettings } from '@/modules/core/settings';
import { SettingsForm } from '@/components/admin/editor/SettingsForm';

type Props = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: getSettingsGroup((await params).key)?.label ?? 'Not found' };
}

/** The generic settings screen, drawn from a settings group declaration. */
export default async function SettingsPage({ params }: Props) {
  const group = getSettingsGroup((await params).key);
  if (!group || group.customScreen) notFound();
  const staff = await requireAreaPage(group.area);
  if (!(await isOn(group.module))) notFound();
  const [values, site] = await Promise.all([getSetting(group), getSetting(siteSettings)]);
  return (
    <SettingsForm
      groupKey={group.key}
      label={group.label}
      description={group.description}
      fields={group.fields}
      initial={values as Record<string, unknown>}
      timeZone={site.timeZone}
      isAdmin={staff.areas.includes('*')}
      panel={group.key === 'brand' ? 'brand' : undefined}
    />
  );
}
