import { defineModule } from '@/lib/modules/types';
import { siteSettings } from './settings';
import { coreResources } from './resources';
import { brandSettings } from '@/lib/theme/brand';
import { navigationSettings } from './navigation';
import { seoSettings } from '@/lib/seo/settings';

export const manifest = defineModule({
  id: 'core',
  label: 'Core',
  description: 'Pages and block builder, media, navigation, brand and theme, SEO core, users and roles, redirects, 404 log, Trash, email and settings.',
  defaultOn: true,
  alwaysOn: true,
  navigation: [
    { group: 'Overview', label: 'Dashboard', href: '/admin', area: 'overview' },
    { group: 'Content', label: 'Media', href: '/admin/media', area: 'media' },
    { group: 'SEO', label: 'SEO overview', href: '/admin/seo', area: 'seo' },
    { group: 'Settings', label: 'API keys', href: '/admin/api-keys', area: 'apikeys' },
    { group: 'Settings', label: 'Modules', href: '/admin/modules', area: 'modules' },
    { group: 'Settings', label: 'Email templates', href: '/admin/email-templates', area: 'settings' },
  ],
  resources: coreResources,
  settings: [siteSettings, brandSettings, navigationSettings, seoSettings],
});
