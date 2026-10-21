import type { ReactNode } from 'react';
import { SiteFrame } from '@/components/site/SiteFrame';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
