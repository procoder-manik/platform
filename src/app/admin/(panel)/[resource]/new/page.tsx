import { getResource } from '@/lib/admin/registry';
import { EditorScreen } from '../editor-page';

type Props = { params: Promise<{ resource: string }>; searchParams: Promise<Record<string, string>> };

export async function generateMetadata({ params }: Props) {
  const def = getResource((await params).resource);
  return { title: def ? `Add ${def.label.toLowerCase()}` : 'Not found' };
}

export default async function NewRecordPage({ params, searchParams }: Props) {
  return <EditorScreen resourceId={(await params).resource} id={null} prefill={await searchParams} />;
}
