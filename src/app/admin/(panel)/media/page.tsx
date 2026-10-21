import { requireAreaPage } from '@/lib/auth/guards';
import { MediaLibrary } from '@/components/admin/media/MediaLibrary';
import { PageHeader } from '@/components/admin/ui';

export const metadata = { title: 'Media' };

export default async function MediaPage() {
  await requireAreaPage('media');
  return (
    <div className="max-w-7xl">
      <PageHeader title="Media" description="Images, video and documents for the site. Files upload straight to your storage provider and are checked by their real contents." />
      <div className="mt-6">
        <MediaLibrary mode="manage" />
      </div>
    </div>
  );
}
