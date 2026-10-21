/**
 * The module registry. Every module folder exports a manifest; this file is the only place that lists them.
 * Nothing outside a module hard-codes its routes or menu items.
 */
import { manifest as core } from './core/manifest';
import { manifest as blog } from './blog/manifest';
import { manifest as portfolio } from './portfolio/manifest';
import { manifest as caseStudies } from './caseStudies/manifest';
import { manifest as productsShowcase } from './productsShowcase/manifest';
import { manifest as resume } from './resume/manifest';
import { manifest as testimonials } from './testimonials/manifest';
import { manifest as services } from './services/manifest';
import { manifest as subscriptions } from './subscriptions/manifest';
import { manifest as store } from './store/manifest';
import { manifest as checkout } from './checkout/manifest';
import { manifest as reviews } from './reviews/manifest';
import { manifest as coupons } from './coupons/manifest';
import { manifest as referrals } from './referrals/manifest';
import { manifest as affiliates } from './affiliates/manifest';
import { manifest as accounts } from './accounts/manifest';
import { manifest as forms } from './forms/manifest';
import { manifest as popups } from './popups/manifest';
import { manifest as announcement } from './announcement/manifest';
import { manifest as crm } from './crm/manifest';
import { manifest as knowledge } from './knowledge/manifest';
import { manifest as chat } from './chat/manifest';
import { manifest as aiWriter } from './aiWriter/manifest';
import { manifest as aiNews } from './aiNews/manifest';
import { manifest as newsletter } from './newsletter/manifest';
import { manifest as i18n } from './i18n/manifest';
import { manifest as maintenance } from './maintenance/manifest';
import { manifest as demo } from './demo/manifest';
import type { ModuleManifest } from '@/lib/modules/types';

export const MODULES: readonly ModuleManifest[] = [
  core,
  blog,
  portfolio,
  caseStudies,
  productsShowcase,
  resume,
  testimonials,
  services,
  subscriptions,
  store,
  checkout,
  reviews,
  coupons,
  referrals,
  affiliates,
  accounts,
  forms,
  popups,
  announcement,
  crm,
  knowledge,
  chat,
  aiWriter,
  aiNews,
  newsletter,
  i18n,
  maintenance,
  demo,
];

export function getManifest(id: string): ModuleManifest | undefined {
  return MODULES.find((m) => m.id === id);
}
