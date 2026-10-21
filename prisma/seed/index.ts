/**
 * Seed script: `npm run db:seed` (or SEED_PRESET=agency npm run db:seed, or `-- --preset=agency`).
 * 1. Creates the first administrator from ADMIN_EMAIL and ADMIN_PASSWORD.
 * 2. Loads a starting preset (blank, freelancer, agency, shop, local): modules, brand preset, menu,
 *    placeholder pages built from templates, and sample posts and projects where the preset uses them.
 * Safe to run more than once: existing users, pages, posts, projects and saved settings are never changed.
 */
import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../../src/generated/prisma/client';
import { renderRichText } from '../../src/lib/richtext/render';
import { PRESETS, postBody, templateBlocks } from './presets';

const json = (v: unknown) => v as Prisma.InputJsonValue;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });
  try {
    // 1. Administrator
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? '';
    let adminId: string | null = null;
    if (email) {
      if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
      const existing = await db.user.findUnique({ where: { email } });
      if (existing) {
        adminId = existing.id;
        console.info(`Administrator ${email} already exists.`);
      } else {
        const created = await db.user.create({ data: { email, name: 'Administrator', kind: 'STAFF', role: 'administrator', emailVerified: new Date(), passwordHash: await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 }) } });
        adminId = created.id;
        console.info(`Administrator ${email} created.`);
      }
    } else console.info('ADMIN_EMAIL is empty, so no administrator was created.');

    // 2. Preset
    const arg = process.argv.find((a) => a.startsWith('--preset='))?.split('=')[1];
    const presetId = (arg ?? process.env.SEED_PRESET ?? '').trim();
    if (!presetId) {
      console.info('No preset chosen. Add SEED_PRESET=freelancer (blank, freelancer, agency, shop or local) to load starting content.');
      return;
    }
    const preset = PRESETS[presetId];
    if (!preset) throw new Error(`Unknown preset "${presetId}". Use one of: ${Object.keys(PRESETS).join(', ')}.`);

    const setOnce = async (key: string, data: unknown) => {
      const exists = await db.setting.findUnique({ where: { key } });
      if (exists) return console.info(`Setting "${key}" already saved, kept as is.`);
      await db.setting.create({ data: { key, data: json(data) } });
    };
    await setOnce('modules', preset.modules);
    await setOnce('brand', { preset: preset.brand });
    await setOnce('navigation', { menu: preset.menu.map((m) => ({ ...m, children: [] })), buttonLabel: 'Get in touch', buttonHref: '/contact' });

    let pages = 0;
    for (const page of preset.pages) {
      const exists = await db.page.findUnique({ where: { slug: page.slug } });
      if (exists) continue;
      const hasHome = page.isHome ? await db.page.findFirst({ where: { isHome: true, deletedAt: null } }) : null;
      await db.page.create({ data: { title: page.title, slug: page.slug, template: page.template, status: 'PUBLISHED', isHome: Boolean(page.isHome && !hasHome), showInFooter: page.showInFooter ?? false, blocks: json(templateBlocks(page.template, page.extra)), seo: json({}) } });
      pages += 1;
    }

    for (const c of preset.categories ?? []) await db.category.upsert({ where: { slug: c.slug }, create: c, update: {} });
    const firstCategory = preset.categories?.[0] ? await db.category.findUnique({ where: { slug: preset.categories[0].slug } }) : null;
    let posts = 0;
    for (const p of preset.posts ?? []) {
      if (await db.post.findUnique({ where: { slug: p.slug } })) continue;
      const body = postBody(p.title);
      const rendered = renderRichText(body);
      await db.post.create({ data: { title: p.title, slug: p.slug, excerpt: 'A sample post. Replace it with your own writing.', body: json(body), bodyHtml: rendered.html, readingMinutes: rendered.readingMinutes, tags: p.tags, categoryId: firstCategory?.id ?? null, authorId: adminId, status: 'DRAFT', seo: json({}) } });
      posts += 1;
    }
    let projects = 0;
    for (const [i, p] of (preset.projects ?? []).entries()) {
      if (await db.project.findUnique({ where: { slug: p.slug } })) continue;
      await db.project.create({ data: { ...p, technologies: [], gallery: [], order: i, featured: i === 0, status: 'DRAFT', seo: json({}) } });
      projects += 1;
    }
    let packages = 0;
    for (const [i, svc] of (preset.services ?? []).entries()) {
      const service = await db.service.upsert({ where: { slug: svc.slug }, create: { name: svc.name, slug: svc.slug, summary: svc.summary, order: i, active: false, requirements: [] }, update: {} });
      for (const [j, pkg] of svc.packages.entries()) {
        if (await db.package.findUnique({ where: { slug: pkg.slug } })) continue;
        await db.package.create({ data: { serviceId: service.id, name: pkg.name, slug: pkg.slug, tagline: pkg.tagline, price: 0, mode: 'quote', order: j, active: false, features: [] } });
        packages += 1;
      }
    }
    console.info(`Preset "${preset.label}": ${pages} page(s), ${posts} sample post(s), ${projects} sample project(s), ${packages} placeholder package(s). Sample posts, projects and packages are saved switched off or as drafts: replace them before publishing.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
