import { getResource } from '@/lib/admin/registry';
import { EditorScreen } from '../editor-page';

type Props = { params: Promise<{ resource: string; id: string }>; searchParams: Promise<{ created?: string }> };

export async function generateMetadata({ params }: Props) {
  const def = getResource((await params).resource);
  return { title: def ? `Edit ${def.label.toLowerCase()}` : 'Not found' };
}

export default async function EditRecordPage({ params, searchParams }: Props) {
  const { resource, id } = await params;
  return <EditorScreen resourceId={resource} id={decodeURIComponent(id)} created={(await searchParams).created === '1'} />;
}
