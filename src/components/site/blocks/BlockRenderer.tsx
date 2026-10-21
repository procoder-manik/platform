/* Server renderer for page blocks. Blocks of switched-off modules and hidden blocks render nothing. */
/* eslint-disable @next/next/no-img-element */
import { Fragment, type ReactNode } from 'react';
import { getBlockDef } from '@/lib/blocks/catalog';
import { cleanHtml, scopedCss } from '@/lib/blocks/sanitize';
import { renderMarkdown } from '@/lib/blocks/markdown';
import type { Block, BlockStyle } from '@/lib/blocks/types';
import type { ModuleStates } from '@/lib/modules/logic';
import { getGlobalSection } from '@/lib/data/pages';
import { listApps, listCaseStudies, listPosts, listProjects, listTestimonials } from '@/lib/data/content';
import { getSetting } from '@/lib/settings/store';
import { siteSettings } from '@/modules/core/settings';
import { portfolioSettings } from '@/modules/portfolio/settings';
import { PostCard, ProjectCard } from '../content/Cards';
import { listServices } from '@/lib/data/services';
import { servicesSettings } from '@/modules/services/settings';
import { PackageBrowser } from '../client/PackageBrowser';
import { Carousel } from '../client/Carousel';
import { ContactForm, Countdown, Tabs } from '../client/Interactive';
import { Card, fillTemplate, type CardItem } from './cards';
import { Buttons, Img, Markdown, SectionHeading, SmartLink, VideoPlayer, type ButtonData } from './parts';

export interface RenderContext {
  modules: ModuleStates;
  /** Inside a container or a global section: no nested sections, smaller headings. */
  nested?: boolean;
  /** Global section ids already being rendered, to stop loops. */
  trail?: string[];
}

const PAD_TOP = { none: 'pt-0', sm: 'pt-8', md: 'pt-14 md:pt-16', lg: 'pt-20 md:pt-24', xl: 'pt-24 md:pt-32' } as const;
const PAD_BOTTOM = { none: 'pb-0', sm: 'pb-8', md: 'pb-14 md:pb-16', lg: 'pb-20 md:pb-24', xl: 'pb-24 md:pb-32' } as const;
const BG = { none: '', base: 'bg-base', surface: 'bg-surface', raised: 'bg-raised', primary: 'bg-primary text-primary-ink', secondary: 'bg-secondary text-base', ink: 'bg-ink text-base' } as const;
const WIDTH = { narrow: 'max-w-3xl', shell: 'max-w-shell', wide: 'max-w-[90rem]', full: 'max-w-none' } as const;
const GRID = { 1: 'grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' } as const;

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const arr = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);

function Shell({ block, children, nested, extraCss }: { block: Block; children: ReactNode; nested?: boolean; extraCss?: string }) {
  const s: BlockStyle = { ...(getBlockDef(block.type)?.defaultStyle ?? {}), ...block.style };
  const hide = [s.hideOn?.includes('mobile') ? 'hidden md:block' : '', s.hideOn?.includes('desktop') ? 'md:hidden' : ''].join(' ');
  const center = s.align === 'center' ? 'text-center' : '';
  if (nested) {
    return (
      <div id={s.anchor || block.id} className={`${hide} ${center}`} data-block={block.type}>
        {extraCss ? <style>{extraCss}</style> : null}
        {children}
      </div>
    );
  }
  return (
    <section
      id={s.anchor || block.id}
      data-block={block.type}
      data-bg={s.background && s.background !== 'none' ? s.background : undefined}
      data-animate={s.animation && s.animation !== 'none' ? s.animation : undefined}
      className={`${PAD_TOP[s.paddingTop ?? 'md']} ${PAD_BOTTOM[s.paddingBottom ?? 'md']} ${BG[s.background ?? 'none']} ${hide} scroll-mt-24`}
    >
      {extraCss ? <style>{extraCss}</style> : null}
      <div className={`mx-auto px-5 sm:px-6 ${WIDTH[s.width ?? 'shell']} ${s.width === 'full' ? 'px-0 sm:px-0' : ''} ${center}`}>{children}</div>
    </section>
  );
}

function CardsBlock({ block }: { block: Block }) {
  const p = block.props;
  const items = arr<CardItem>(p.items);
  const template = str(p.template) || 'service';
  const columns = Math.min(4, Math.max(1, Number(p.columns) || 3)) as 1 | 2 | 3 | 4;
  const center = block.style.align === 'center';
  const custom = template === 'custom' && str(p.customHtml) ? cleanHtml(str(p.customHtml)) : null;
  const cards = items.map((item, i) =>
    custom ? (
      <div key={i} className="h-full" dangerouslySetInnerHTML={{ __html: fillTemplate(custom, item) }} />
    ) : (
      <Card key={i} template={template} item={item} index={i} headingLevel="h3" />
    ),
  );
  return (
    <>
      <SectionHeading heading={p.heading} intro={p.intro} center={center} />
      {p.layoutMode === 'carousel' ? (
        <Carousel columns={columns} autoplay={p.autoplay === true} interval={Number(p.interval) || 5} arrows={p.arrows !== false} dots={p.dots !== false} label={str(p.heading) || 'Cards'}>
          {cards}
        </Carousel>
      ) : (
        <div className={`grid grid-cols-1 gap-5 text-left ${GRID[columns]}`}>{cards}</div>
      )}
    </>
  );
}

async function renderOne(block: Block, ctx: RenderContext): Promise<ReactNode> {
  const def = getBlockDef(block.type);
  if (!def || block.hidden || ctx.modules[def.module] !== true) return null;
  const p = block.props;
  const nested = ctx.nested;
  const center = block.style.align === 'center';

  switch (block.type) {
    case 'section':
    case 'columns': {
      const children = await Promise.all((block.children ?? []).map((c) => renderOne(c, { ...ctx, nested: true })));
      const count = Math.min(4, Math.max(2, Number(p.count) || 2)) as 2 | 3 | 4;
      const gap = { sm: 'gap-4', md: 'gap-8', lg: 'gap-12' }[str(p.gap) as 'sm' | 'md' | 'lg'] ?? 'gap-8';
      return (
        <Shell block={block}>
          <SectionHeading heading={p.heading} intro={p.intro} center={center} />
          {block.type === 'columns' ? <div className={`grid grid-cols-1 ${gap} ${GRID[count]}`}>{children}</div> : <div className="space-y-10">{children}</div>}
        </Shell>
      );
    }
    case 'hero': {
      const variant = str(p.variant);
      const H = nested ? 'h2' : 'h1';
      const text = (
        <div className={variant === 'image-right' ? '' : `max-w-3xl ${center ? 'mx-auto' : ''}`}>
          <H className="text-h1">{str(p.heading)}</H>
          {p.intro ? <p className="mt-5 max-w-2xl text-lg md:text-xl">{str(p.intro)}</p> : null}
          <Buttons buttons={arr<ButtonData>(p.buttons)} center={center} />
        </div>
      );
      if (variant === 'image-background' && p.image) {
        return (
          <Shell block={{ ...block, style: { ...block.style, width: 'full' } }} nested={nested}>
            <div className="relative isolate overflow-hidden">
              <img src={str(p.image)} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" fetchPriority="high" />
              <div className="absolute inset-0 -z-10 bg-ink/60" aria-hidden="true" />
              <div className="mx-auto max-w-shell px-5 py-24 text-base sm:px-6 md:py-36 [&_h1]:text-base">{text}</div>
            </div>
          </Shell>
        );
      }
      if (variant === 'showcase' && ctx.modules.portfolio) {
        const [projects, ps] = await Promise.all([listProjects({ featured: true, limit: 2 }), getSetting(portfolioSettings)]);
        if (projects.length) {
          return (
            <Shell block={block} nested={nested}>
              <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
                {text}
                <div className="grid gap-5 sm:grid-cols-2">{projects.map((p) => <ProjectCard key={p.id} project={p} speed={ps.scrollSpeed} headingLevel="h2" />)}</div>
              </div>
            </Shell>
          );
        }
      }
      if (variant === 'image-right' || variant === 'video') {
        return (
          <Shell block={block} nested={nested}>
            <div className="grid items-center gap-10 md:grid-cols-2">
              {text}
              {variant === 'video' && p.video ? <VideoPlayer url={str(p.video)} title={str(p.heading)} /> : <Img src={str(p.image)} alt="" eager ratio="aspect-[4/3]" className="w-full rounded-card object-cover" />}
            </div>
          </Shell>
        );
      }
      return <Shell block={block} nested={nested}>{text}</Shell>;
    }
    case 'richText':
      return <Shell block={block} nested={nested}><Markdown source={p.content} className={center ? 'mx-auto' : ''} /></Shell>;
    case 'imageText':
      return (
        <Shell block={block} nested={nested}>
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div className={p.imageSide === 'left' ? 'md:order-2' : ''}>
              {p.heading ? <h2>{str(p.heading)}</h2> : null}
              <Markdown source={p.content} className="mt-4" />
              <Buttons buttons={arr<ButtonData>(p.buttons)} />
            </div>
            <Img src={str(p.image)} alt="" ratio="aspect-[4/3]" className="w-full rounded-card object-cover" />
          </div>
        </Shell>
      );
    case 'quote':
      return (
        <Shell block={block} nested={nested}>
          <figure className={`max-w-3xl ${center ? 'mx-auto' : ''}`}>
            <blockquote className="font-display text-h3 text-ink">“{str(p.quote)}”</blockquote>
            {p.name ? (
              <figcaption className={`mt-6 flex items-center gap-3 ${center ? 'justify-center' : ''}`}>
                {p.image ? <img src={str(p.image)} alt="" loading="lazy" className="h-12 w-12 rounded-full object-cover" /> : null}
                <span className="text-left"><span className="block font-semibold text-ink">{str(p.name)}</span><span className="text-sm text-muted">{str(p.role)}</span></span>
              </figcaption>
            ) : null}
          </figure>
        </Shell>
      );
    case 'logoStrip':
      return (
        <Shell block={block} nested={nested}>
          {p.heading ? <p className="mb-6 text-center text-muted">{str(p.heading)}</p> : null}
          <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
            {arr<{ image?: string; name?: string; href?: string }>(p.logos).map((logo, i) => {
              const img = <img src={logo.image} alt={logo.name ?? ''} loading="lazy" className="h-8 w-auto max-w-36 object-contain opacity-80 grayscale transition hover:opacity-100 hover:grayscale-0 md:h-10" />;
              return <li key={i}>{logo.href ? <SmartLink href={logo.href}>{img}</SmartLink> : img}</li>;
            })}
          </ul>
        </Shell>
      );
    case 'stats':
      return (
        <Shell block={block} nested={nested}>
          <SectionHeading heading={p.heading} center={center} />
          <dl className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {arr<{ value?: string; label?: string }>(p.items).map((s, i) => (
              <div key={i} className="flex flex-col-reverse">
                <dt className="mt-1 text-muted">{s.label}</dt>
                <dd className="font-display text-h2 font-semibold text-ink">{s.value}</dd>
              </div>
            ))}
          </dl>
        </Shell>
      );
    case 'countdown':
      return (
        <Shell block={block} nested={nested}>
          <SectionHeading heading={p.heading} center={center} />
          {p.until ? <Countdown until={new Date(String(p.until)).toISOString()} doneText={str(p.doneText)} /> : null}
        </Shell>
      );
    case 'cards':
    case 'featureGrid':
    case 'steps':
    case 'team':
    case 'pricingTable': {
      const css = str(p.template) === 'custom' && str(p.customCss) ? scopedCss(block.style.anchor || block.id, str(p.customCss)) : '';
      return <Shell block={block} nested={nested} extraCss={css}><CardsBlock block={block} /></Shell>;
    }
    case 'timeline':
      return (
        <Shell block={block} nested={nested}>
          <SectionHeading heading={p.heading} center={center} />
          <ol className="relative mx-auto max-w-3xl border-l-2 border-line pl-8 text-left">
            {arr<{ date?: string; title?: string; body?: string }>(p.items).map((e, i) => (
              <li key={i} className="relative pb-10 last:pb-0">
                <span className="absolute -left-[2.6rem] top-1 h-4 w-4 rounded-full border-4 border-base bg-primary" aria-hidden="true" />
                <p className="text-sm font-semibold text-primary">{e.date}</p>
                <h3 className="mt-1 text-h5">{e.title}</h3>
                {e.body ? <p className="mt-2">{e.body}</p> : null}
              </li>
            ))}
          </ol>
        </Shell>
      );
    case 'comparison': {
      const options = arr<string>(p.options);
      const cell = (v?: string) => (v?.toLowerCase() === 'yes' ? <span className="text-success">✓<span className="sr-only">Yes</span></span> : v?.toLowerCase() === 'no' ? <span className="text-muted">–<span className="sr-only">No</span></span> : v);
      return (
        <Shell block={block} nested={nested}>
          <SectionHeading heading={p.heading} center={center} />
          <div className="overflow-x-auto rounded-card border border-line bg-surface">
            <table className="w-full min-w-[32rem] text-left">
              <thead><tr className="border-b border-line"><td className="p-4" />{options.map((o) => <th key={o} scope="col" className="p-4 font-semibold text-ink">{o}</th>)}</tr></thead>
              <tbody>
                {arr<{ label?: string; values?: string[] }>(p.rows).map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <th scope="row" className="p-4 font-medium text-ink">{r.label}</th>
                    {options.map((_, j) => <td key={j} className="p-4">{cell(r.values?.[j])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Shell>
      );
    }
    case 'gallery': {
      const images = arr<string>(p.images);
      const cols = Math.min(4, Math.max(2, Number(p.columns) || 3)) as 2 | 3 | 4;
      const style = str(p.style);
      const pics = images.map((src, i) => <img key={i} src={src} alt="" loading="lazy" className={`w-full rounded-card object-cover ${style === 'grid' ? 'aspect-square' : ''} ${style === 'masonry' ? 'mb-4 break-inside-avoid' : ''}`} />);
      return (
        <Shell block={block} nested={nested}>
          <SectionHeading heading={p.heading} center={center} />
          {style === 'slider' ? (
            <Carousel columns={cols} autoplay={false} interval={5} arrows dots label={str(p.heading) || 'Gallery'}>{pics}</Carousel>
          ) : style === 'masonry' ? (
            <div className={`gap-4 ${{ 2: 'columns-2', 3: 'columns-2 md:columns-3', 4: 'columns-2 md:columns-4' }[cols]}`}>{pics}</div>
          ) : (
            <div className={`grid grid-cols-2 gap-4 ${{ 2: '', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }[cols]}`}>{pics}</div>
          )}
        </Shell>
      );
    }
    case 'video':
      return (
        <Shell block={block} nested={nested}>
          <figure className="mx-auto max-w-4xl">
            {p.url ? <VideoPlayer url={str(p.url)} title={str(p.title)} /> : null}
            {p.caption ? <figcaption className="mt-3 text-center text-sm text-muted">{str(p.caption)}</figcaption> : null}
          </figure>
        </Shell>
      );
    case 'map':
      return (
        <Shell block={block} nested={nested}>
          <iframe src={str(p.embedUrl)} title={str(p.title)} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="w-full rounded-card border border-line" style={{ height: Math.min(700, Math.max(200, Number(p.height) || 400)) }} />
        </Shell>
      );
    case 'cta':
      return (
        <Shell block={block} nested={nested}>
          <div className={`max-w-3xl ${center ? 'mx-auto' : ''}`}>
            <h2>{str(p.heading)}</h2>
            {p.intro ? <p className="mt-3 text-lg">{str(p.intro)}</p> : null}
            <Buttons buttons={arr<ButtonData>(p.buttons)} center={center} />
          </div>
        </Shell>
      );
    case 'contactForm':
      return (
        <Shell block={block} nested={nested}>
          <SectionHeading heading={p.heading} intro={p.intro} center={center} />
          <div className="text-left"><ContactForm showPhone={p.showPhone === true} success={str(p.success) || 'Thank you.'} source={block.id} /></div>
        </Shell>
      );
    case 'bookingLink':
      return (
        <Shell block={block} nested={nested}>
          <SectionHeading heading={p.heading} intro={p.intro} center={center} />
          {p.href ? <SmartLink href={str(p.href)} className="btn btn-primary">{str(p.label)}</SmartLink> : null}
        </Shell>
      );
    case 'tabs':
      return (
        <Shell block={block} nested={nested}>
          <SectionHeading heading={p.heading} center={center} />
          <Tabs items={arr<{ label?: string; content?: string }>(p.items).map((t) => ({ label: t.label ?? '', html: renderMarkdown(t.content ?? '') }))} />
        </Shell>
      );
    case 'accordion':
    case 'faq': {
      const items = arr<Record<string, string>>(p.items).map((it) => ({ title: it.title ?? it.question ?? '', body: it.content ?? it.answer ?? '' }));
      return (
        <Shell block={block} nested={nested}>
          <SectionHeading heading={p.heading} center={center} />
          <div className={`max-w-3xl divide-y divide-line border-y border-line text-left ${center ? 'mx-auto' : ''}`} data-faq={block.type === 'faq' ? '' : undefined}>
            {items.map((it, i) => (
              <details key={i} className="group py-1">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold text-ink">
                  {block.type === 'faq' ? <h3 className="text-h6">{it.title}</h3> : <span>{it.title}</span>}
                  <span className="transition-transform group-open:rotate-180" aria-hidden="true">⌄</span>
                </summary>
                <Markdown source={it.body} className="pb-4" />
              </details>
            ))}
          </div>
        </Shell>
      );
    }
    case 'spacer':
      return <div aria-hidden="true" className={{ sm: 'h-6', md: 'h-12', lg: 'h-20', xl: 'h-32' }[str(p.size) as 'sm'] ?? 'h-12'} />;
    case 'divider':
      return <div className={p.inset === false ? '' : 'mx-auto max-w-shell px-5 sm:px-6'}><hr className="border-line" /></div>;
    case 'customHtml': {
      const css = str(p.css) ? scopedCss(block.style.anchor || block.id, str(p.css)) : '';
      return <Shell block={block} nested={nested} extraCss={css}><div dangerouslySetInnerHTML={{ __html: cleanHtml(str(p.html)) }} /></Shell>;
    }
    case 'blogPosts': {
      const [{ posts }, site] = await Promise.all([listPosts({ perPage: Math.min(12, Number(p.count) || 3), featuredFirst: p.source === 'featured', categoryId: str(p.categoryId) || undefined }), getSetting(siteSettings)]);
      if (!posts.length) return null;
      const cards = posts.map((post) => <PostCard key={post.id} post={post} timeZone={site.timeZone} headingLevel="h3" />);
      const columns = Math.min(4, Math.max(1, Number(p.columns) || 3)) as 1 | 2 | 3 | 4;
      return (
        <Shell block={block} nested={nested}>
          <SectionHeading heading={p.heading} intro={p.intro} center={center} />
          {p.layoutMode === 'carousel' ? <Carousel columns={columns} autoplay={p.autoplay === true} interval={Number(p.interval) || 5} arrows={p.arrows !== false} dots={p.dots !== false} label={str(p.heading) || 'Posts'}>{cards}</Carousel> : <div className={`grid grid-cols-1 gap-6 text-left ${GRID[columns]}`}>{cards}</div>}
          <p className={`mt-8 ${center ? 'text-center' : ''}`}><SmartLink href="/blog" className="btn btn-ghost">All posts</SmartLink></p>
        </Shell>
      );
    }
    case 'portfolioGrid': {
      const [projects, ps] = await Promise.all([listProjects({ featured: p.featuredOnly === true, limit: Math.min(24, Number(p.count) || 4) }), getSetting(portfolioSettings)]);
      if (!projects.length) return null;
      const cols = Math.min(3, Math.max(1, Number(p.columns) || 2)) as 1 | 2 | 3;
      return (
        <Shell block={block} nested={nested}>
          <SectionHeading heading={p.heading} intro={p.intro} center={center} />
          <div className={`grid grid-cols-1 gap-10 text-left ${{ 1: '', 2: 'md:grid-cols-2', 3: 'md:grid-cols-2 lg:grid-cols-3' }[cols]}`}>{projects.map((pr) => <ProjectCard key={pr.id} project={pr} speed={ps.scrollSpeed} headingLevel="h3" />)}</div>
          <p className={`mt-8 ${center ? 'text-center' : ''}`}><SmartLink href="/portfolio" className="btn btn-ghost">All work</SmartLink></p>
        </Shell>
      );
    }
    case 'caseStudyList': {
      const items = await listCaseStudies(Math.min(12, Number(p.count) || 2));
      if (!items.length) return null;
      return (
        <Shell block={block} nested={nested}>
          <SectionHeading heading={p.heading} intro={p.intro} center={center} />
          <div className="grid gap-6 text-left md:grid-cols-2">
            {items.map((c) => (
              <article key={c.id} className="group relative rounded-card border border-line bg-surface p-6">
                {c.client ? <p className="text-sm font-medium text-primary">{c.client}</p> : null}
                <h3 className="mt-1 text-h5"><SmartLink href={`/case-studies/${c.slug}`} className="after:absolute after:inset-0 group-hover:underline">{c.title}</SmartLink></h3>
                {c.summary ? <p className="mt-2">{c.summary}</p> : null}
              </article>
            ))}
          </div>
        </Shell>
      );
    }
    case 'productsList': {
      const apps = await listApps();
      if (!apps.length) return null;
      return (
        <Shell block={block} nested={nested}>
          <SectionHeading heading={p.heading} intro={p.intro} center={center} />
          <div className="grid gap-5 text-left sm:grid-cols-2 lg:grid-cols-3">
            {apps.map((a) => (
              <article key={a.id} className="group relative flex gap-4 rounded-card border border-line bg-surface p-5">
                {a.logo ? <img src={a.logo} alt="" className="h-12 w-12 rounded-input object-contain" loading="lazy" /> : null}
                <div><h3 className="text-h6"><SmartLink href={`/apps/${a.slug}`} className="after:absolute after:inset-0 group-hover:underline">{a.name}</SmartLink></h3>{a.tagline ? <p className="mt-1 text-sm">{a.tagline}</p> : null}</div>
              </article>
            ))}
          </div>
        </Shell>
      );
    }
    case 'testimonials': {
      const items = await listTestimonials(Math.min(24, Number(p.count) || 6));
      if (!items.length) return null;
      const cards = items.map((t, i) => <Card key={t.id} template="testimonial" index={i} headingLevel="h3" item={{ title: t.name, role: [t.role, t.company].filter(Boolean).join(', '), body: t.quote, image: t.avatar }} />);
      const columns = Math.min(4, Math.max(1, Number(p.columns) || 2)) as 1 | 2 | 3 | 4;
      return (
        <Shell block={block} nested={nested}>
          <SectionHeading heading={p.heading} intro={p.intro} center={center} />
          {p.layoutMode === 'carousel' ? <Carousel columns={columns} autoplay={p.autoplay === true} interval={Number(p.interval) || 6} arrows={p.arrows !== false} dots={p.dots !== false} label={str(p.heading) || 'Testimonials'}>{cards}</Carousel> : <div className={`grid grid-cols-1 gap-6 text-left ${GRID[columns]}`}>{cards}</div>}
        </Shell>
      );
    }
    case 'packages': {
      const [services, ss] = await Promise.all([listServices(str(p.serviceId) || undefined), getSetting(servicesSettings)]);
      if (!services.length) return null;
      return (
        <Shell block={block} nested={nested}>
          <SectionHeading heading={p.heading} intro={p.intro} center={center} />
          <PackageBrowser services={services} defaultPeriod={ss.defaultPeriod} showEffectiveMonthly={ss.showEffectiveMonthly} checkoutOn={ctx.modules.checkout === true} contactHref={ss.contactHref} headingLevel="h3" />
        </Shell>
      );
    }
    case 'globalSection': {
      const id = str(p.sectionId);
      if (!id || ctx.trail?.includes(id)) return null;
      const section = await getGlobalSection(id);
      if (!section) return null;
      return renderBlocks(section.blocks, { ...ctx, trail: [...(ctx.trail ?? []), id] });
    }
    default:
      return null;
  }
}

/** Renders a list of blocks. Errors in one block never break the page: that block is skipped and logged. */
export async function renderBlocks(blocks: Block[], ctx: RenderContext): Promise<ReactNode> {
  const out = await Promise.all(
    blocks.map(async (block) => {
      try {
        return <Fragment key={block.id}>{await renderOne(block, ctx)}</Fragment>;
      } catch (error) {
        console.error(`[blocks] "${block.type}" (${block.id}) failed to render`, error);
        return null;
      }
    }),
  );
  return out;
}

