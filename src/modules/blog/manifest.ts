import { defineModule } from '@/lib/modules/types';
import { categoriesResource, postsResource } from './resources';
import { blogSettings } from './settings';

export const manifest = defineModule({
  id: 'blog',
  label: 'Blog',
  description: 'Articles, categories, tags, authors and an RSS feed.',
  defaultOn: true,
  routes: ['/blog', '/feed.xml'],
  resources: [postsResource, categoriesResource],
  settings: [blogSettings],
});
