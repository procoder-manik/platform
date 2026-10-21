import { requireAreaPage } from '@/lib/auth/guards';
import { listKeyStatus } from '@/lib/security/key-actions';
import { API_KEYS } from '@/lib/security/keys';
import { PageHeader } from '@/components/admin/ui';
import { KeysBoard } from './keys-board';

export const metadata = { title: 'API keys' };
export const dynamic = 'force-dynamic';

export default async function ApiKeysPage() {
  await requireAreaPage('apikeys');
  const status = await listKeyStatus();
  return (
    <div className="max-w-3xl">
      <PageHeader title="API keys" description="Keys for payment gateways and other services. They are stored encrypted and only the last four characters are ever shown again. A key set in the environment wins over one saved here." />
      <KeysBoard keys={API_KEYS.map((k) => ({ name: k.name, label: k.label, group: k.group, help: k.help }))} status={status} />
    </div>
  );
}
