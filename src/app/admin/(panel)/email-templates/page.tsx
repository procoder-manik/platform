import Link from 'next/link';
import { requireAreaPage } from '@/lib/auth/guards';
import { getDb } from '@/lib/db';
import { EMAIL_TEMPLATES, TEMPLATE_GROUP, type TemplateId } from '@/lib/mail/templates';
import { getSetting } from '@/lib/data';
import { siteSettings } from '@/modules/core/settings';
import { PageHeader } from '@/components/admin/ui';
import { formatDate } from '@/components/admin/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Email templates' };

const GROUP_ORDER = ['Orders', 'Subscriptions', 'Referrals', 'Affiliates', 'Accounts', 'Alerts to you'];

export default async function EmailTemplatesPage() {
  await requireAreaPage('settings');
  const [overrides, site] = await Promise.all([getDb().emailTemplateOverride.findMany(), getSetting(siteSettings)]);
  const ids = Object.keys(EMAIL_TEMPLATES) as TemplateId[];
  const groups = GROUP_ORDER.map((name) => ({ name, ids: ids.filter((id) => TEMPLATE_GROUP[id] === name) })).filter((g) => g.ids.length);

  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader title="Email templates" description="The wording of every automatic email. Customers get theirs in their account's language once translation arrives; for now every email is in the wording you set here. Open one to edit it, preview it and send yourself a test." />
      {groups.map((g) => (
        <section key={g.name} aria-labelledby={g.name}>
          <h2 id={g.name} className="font-display text-base font-semibold text-ink">{g.name}</h2>
          <ul className="mt-3 divide-y divide-line rounded-card border border-line bg-surface">
            {g.ids.map((id) => {
              const custom = overrides.find((o) => o.templateId === id);
              return (
                <li key={id}>
                  <Link href={`/admin/email-templates/${id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-raised">
                    <span><span className="font-medium text-ink">{EMAIL_TEMPLATES[id].subject.replace(/\{[a-z_]+\}/g, '…')}</span><span className="block text-sm text-muted">{id}</span></span>
                    <span className="text-sm text-muted">{custom ? `Edited${custom.updatedBy ? ` by ${custom.updatedBy}` : ''}, ${formatDate(custom.updatedAt.toISOString(), site.timeZone)}` : 'Built-in wording'}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
