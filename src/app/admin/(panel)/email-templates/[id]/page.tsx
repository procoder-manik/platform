import { notFound } from 'next/navigation';
import { requireAreaPage } from '@/lib/auth/guards';
import { getDb } from '@/lib/db';
import { EMAIL_TEMPLATES, PLACEHOLDERS, TEMPLATE_GROUP, placeholdersIn, type TemplateId } from '@/lib/mail/templates';
import { TemplateEditor } from './template-editor';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const id = (await params).id as TemplateId;
  return { title: id in EMAIL_TEMPLATES ? `Email: ${id}` : 'Not found' };
}

export default async function EmailTemplatePage({ params }: Props) {
  await requireAreaPage('settings');
  const id = (await params).id as TemplateId;
  if (!(id in EMAIL_TEMPLATES)) notFound();
  const base = EMAIL_TEMPLATES[id];
  const override = await getDb().emailTemplateOverride.findUnique({ where: { templateId: id } });
  return (
    <TemplateEditor
      id={id}
      group={TEMPLATE_GROUP[id]}
      defaultSubject={base.subject}
      defaultBody={base.body}
      subject={override?.subject ?? base.subject}
      body={override?.body ?? base.body}
      customised={Boolean(override)}
      placeholders={[...new Set([...PLACEHOLDERS, ...placeholdersIn(`${base.subject} ${base.body}`)])]}
      to={base.to}
    />
  );
}
